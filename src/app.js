import 'dotenv/config';
import { Client, Collection, GatewayIntentBits, Partials } from 'discord.js';
import { REST } from '@discordjs/rest';
import express from 'express';
import cron from 'node-cron';

import config from './config/application.js';
import { initializeDatabase } from './utils/database.js';
import { getGuildConfig } from './services/config/guildConfig.js';
import { getServerCounters, saveServerCounters, updateCounter } from './services/serverstatsService.js';
import { logger, startupLog, shutdownLog } from './utils/logger.js';
import { checkBirthdays } from './services/birthdayService.js';
import { checkGiveaways, checkDailyGiveaways } from './services/giveawayService.js';
import { checkAutoCloseTickets } from './services/ticket.js';
import { loadCommands, registerCommands as registerSlashCommands } from './handlers/loaders/commandLoader.js';
import { runSafeTask, handleTaskError, ErrorCodes } from './utils/errorHandler.js';
import { initializeMusic } from './services/music/riffySetup.js';
import { shutdownMusic } from './services/music/playerHandler.js';
import pkg from '../package.json' with { type: 'json' };
import { EXPECTED_SCHEMA_VERSION, EXPECTED_SCHEMA_LABEL } from './config/database/schemaVersion.js';
import { STAFF_ROLES, refreshStaffMessage } from './commands/Moderation/stafflist.js';

class TitanBot extends Client {
  constructor() {
    super({
      intents: [
        GatewayIntentBits.Guilds,                    
        GatewayIntentBits.GuildMembers,              
        GatewayIntentBits.GuildMessages,             
        GatewayIntentBits.GuildMessageReactions,       
        GatewayIntentBits.MessageContent,            
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildVoiceStates,          
        GatewayIntentBits.GuildBans,                 
      ],
      partials: [
        Partials.GuildMember,
        Partials.User,
        Partials.Message,
      ]
    });

    this.config = config;
    this.commands = new Collection();
    this.events = new Collection();
    this.buttons = new Collection();
    this.selectMenus = new Collection();
    this.modals = new Collection();
    this.cooldowns = new Collection();
    this.db = null;
    this.rest = new REST({ version: '10' }).setToken(config.bot.token);
  }

  async start() {
    try {
      startupLog('Starting TitanBot...');
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      startupLog('Initializing database...');
      const dbInstance = await initializeDatabase();
      this.db = dbInstance.db;

      const dbStatus = this.db.getStatus();
      if (dbStatus.isDegraded) {
        logger.warn('');
        logger.warn('╔═══════════════════════════════════════════════════════╗');
        logger.warn('║ ⚠️  DATABASE RUNNING IN DEGRADED MODE                 ║');
        logger.warn('║                                                       ║');
        logger.warn('║ Connection: In-Memory Storage (PostgreSQL unavailable)║');
        logger.warn('║ Data Persistence: DISABLED - data lost on restart     ║');
        logger.warn('║ Action Required: Fix PostgreSQL and restart bot       ║');
        logger.warn('╚═══════════════════════════════════════════════════════╝');
        logger.warn('');
      } else {
        startupLog(`✅ Database Status: ${dbStatus.connectionType} (fully operational)`);
      }
      
      startupLog('Starting web server...');
      this.startWebServer();
      
      startupLog('Loading commands...');
      await loadCommands(this);
      startupLog(`Commands loaded: ${this.commands.size}`);
      
      startupLog('Loading handlers...');
      await this.loadHandlers();
      startupLog('Handlers loaded');

      initializeMusic(this);
      
      startupLog('Logging into Discord...');
      await this.login(this.config.bot.token);
      startupLog('Discord login successful');

      startupLog('Setting up live staff list listeners...');
      const staffRoleIds = new Set(STAFF_ROLES.map(r => r.id));

      this.on('guildMemberUpdate', async (oldMember, newMember) => {
        try {
          console.log(`[STAFFLIST EVENT] guildMemberUpdate fired for: ${newMember.user.tag}`);
          setTimeout(async () => {
            await refreshStaffMessage(this, newMember.guild.id);
          }, 1500);
        } catch (err) {
          console.error('[STAFFLIST] Error in guildMemberUpdate:', err.message);
        }
      });

      this.on('guildRoleUpdate', async (oldRole, newRole) => {
        if (staffRoleIds.has(newRole.id)) {
          console.log(`[STAFFLIST EVENT] guildRoleUpdate fired for staff role: ${newRole.name}`);
          setTimeout(async () => {
            await refreshStaffMessage(this, newRole.guild.id);
          }, 1500);
        }
      });

      this.on('guildMemberRemove', async (member) => {
        try {
          console.log(`[STAFFLIST EVENT] guildMemberRemove fired for: ${member.user?.tag}`);
          setTimeout(async () => {
            await refreshStaffMessage(this, member.guild.id);
          }, 1500);
        } catch (err) {
          console.error('[STAFFLIST] Error in guildMemberRemove:', err.message);
        }
      });
      
      startupLog('Registering slash commands to server...');
      await this.registerCommands();
      startupLog('Slash commands registration complete');
      
      const databaseMode = dbStatus.isDegraded
        ? 'Optional in-memory mode (data resets after restart)'
        : 'Connected (persistent data enabled)';
      const handlerSummary = `${this.buttons.size} buttons, ${this.selectMenus.size} menus, ${this.modals.size} modals`;
      startupLog(
        `ONLINE ✅ | ${this.commands.size} commands loaded | ${handlerSummary} | Database: ${databaseMode}`
      );
      
      this.setupCronJobs();
    } catch (error) {
      logger.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  startWebServer() {
    const app = express();
    const configuredPort = Number(this.config.api?.port || process.env.PORT || 3000);
    const maxPortRetryAttempts = Number(process.env.PORT_RETRY_ATTEMPTS || 5);
    const host = process.env.WEB_HOST || '0.0.0.0';
    const corsOrigin = this.config.api?.cors?.origin || '*';
    
    app.use((req, res, next) => {
      const allowedOrigins = Array.isArray(corsOrigin) ? corsOrigin : [corsOrigin];
      const origin = req.headers.origin;
      
      if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
        res.header('Access-Control-Allow-Origin', origin || '*');
      }
      res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      
      if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
      }
      next();
    });

    const requestCounts = new Map();
    const windowMs = this.config.api?.rateLimit?.windowMs || 60000;
    const maxRequests = this.config.api?.rateLimit?.max || 100;
    
    app.use((req, res, next) => {
      const ip = req.ip;
      const now = Date.now();
      const windowStart = now - windowMs;
      
      if (!requestCounts.has(ip)) {
        requestCounts.set(ip, []);
      }
      
      const times = requestCounts.get(ip).filter(t => t > windowStart);
      
      if (times.length >= maxRequests) {
        return res.status(429).json({ error: 'Too many requests' });
      }
      
      times.push(now);
      requestCounts.
