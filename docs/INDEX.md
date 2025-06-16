# MultiWikiServer (MWS) Documentation

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Project Structure](#project-structure)
4. [Core Packages](#core-packages)
5. [Setup and Development](#setup-and-development)
6. [API Reference](#api-reference)
7. [Database Schema](#database-schema)
8. [CLI Commands](#cli-commands)
9. [Configuration](#configuration)
10. [Deployment](#deployment)

## Overview

MultiWikiServer (MWS) is a multi-user, multi-wiki server for TiddlyWiki that provides:

- **Multiple Users & Wikis**: Support for multiple users accessing multiple wikis
- **Bag & Recipe System**: Flexible content organization using TiddlyWiki's bag and recipe concepts
- **User & Role Management**: Comprehensive access control with user roles and ACL
- **Database Support**: Multiple database engines supported via Prisma ORM
- **Authentication**: Third-party OAuth and password-based login
- **Plugin System**: Extensible architecture with plugin support
- **Admin Interface**: React-based administrative interface
- **Real-time Collaboration**: Live editing and synchronization

> **⚠️ Important**: This project is in active development and not ready for production use. Do not use it to protect sensitive data or intellectual property.

## Architecture

MWS follows a modular, event-driven architecture with the following key components:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   TiddlyWiki    │    │      MWS        │    │   React Admin   │
│     Core        │◄──►│     Server      │◄──►│   Interface     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         ▲                       ▲                       ▲
         │                       │                       │
         v                       v                       v
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   File System   │    │    Database     │    │   Web Server    │
│    Storage      │    │   (SQLite)      │    │   (HTTP/HTTPS)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Key Architectural Principles

1. **Event-Driven**: All components communicate through a centralized event system
2. **Modular**: Functionality is split into focused packages with clear responsibilities
3. **Type-Safe**: Full TypeScript implementation with strict typing
4. **Database-Agnostic**: Uses Prisma ORM for database abstraction
5. **Plugin-Extensible**: Plugins can add routes, hooks, and functionality

## Project Structure

```
MWS-main/
├── packages/                 # Core packages (monorepo)
│   ├── commander/           # CLI command system
│   ├── events/              # Event system
│   ├── mws/                 # Main MWS server logic
│   ├── react-admin/         # React admin interface
│   ├── server/              # HTTP server and routing
│   └── tiddlywiki-types/    # TypeScript definitions
├── prisma/                  # Database schema and migrations
├── plugins/                 # TiddlyWiki plugins
│   ├── client/              # Client-side plugin
│   └── server/              # Server-side plugin
├── editions/                # TiddlyWiki editions
├── create-package/          # NPM package creation tools
├── tests/                   # Test suite
├── dev/                     # Development configuration
├── docs/                    # Documentation
└── public/                  # Static assets
```

## Core Packages

### @tiddlywiki/mws
The main server package that orchestrates all components.

**Key Files:**
- `src/index.ts` - Main entry point and server startup
- `src/ServerState.ts` - Central configuration and state management
- `src/registerStartup.ts` - Server initialization and setup
- `src/commands/` - CLI command implementations

**Responsibilities:**
- Server initialization and configuration
- Database setup and migrations
- TiddlyWiki integration
- Command-line interface

### @tiddlywiki/server
HTTP server implementation with routing and middleware.

**Key Files:**
- `src/router.ts` - HTTP request routing
- `src/listeners.ts` - HTTP/HTTPS listeners
- `src/StateObject.ts` - Request state management
- `src/zodRoute.ts` - API route validation

**Responsibilities:**
- HTTP request handling
- Route definition and matching
- Request/response processing
- Security middleware (Helmet.js)

### @tiddlywiki/events
Centralized event system for inter-component communication.

**Key Files:**
- `src/index.ts` - Event emitter implementation

**Responsibilities:**
- Event-driven architecture foundation
- Type-safe event definitions
- Async event handling

### @tiddlywiki/commander
Command-line interface system.

**Key Files:**
- `src/BaseCommand.ts` - Base command class
- `src/runCLI.ts` - CLI execution logic

**Responsibilities:**
- CLI command registration
- Command parsing and execution
- Help system

### @tiddlywiki/react-admin
React-based administrative interface.

**Key Files:**
- `src/main.tsx` - React application entry point
- `src/components/` - UI components

**Responsibilities:**
- User management interface
- Wiki administration
- System monitoring

## Setup and Development

### Prerequisites
- Node.js 18+
- npm (comes with Node.js)
- Git

### Development Setup

1. **Clone the repository:**
   ```bash
   git clone https://github.com/TiddlyWiki/MultiWikiServer
   cd MultiWikiServer
   ```

2. **Install dependencies:**
   ```bash
   npm install
   # or for Android development:
   npm run install-android
   ```

3. **Generate SSL certificates (optional, Unix only):**
   ```bash
   npm run certs
   ```

4. **Start development server:**
   ```bash
   npm start
   ```

The development server will be available at:
- HTTP: http://localhost:8080/dev
- HTTPS: https://localhost:8080/dev (if certificates are configured)

### Build Commands

- `npm run build` - Build all packages for production
- `npm run tsc` - Type check all TypeScript files
- `npm run build:admin` - Build React admin interface
- `npm test` - Run test suite

### Project Scripts

The project uses a custom script system (`scripts.mjs`) for managing the monorepo:

- `npm run start` - Start development server with hot reload
- `npm run docs` - Start server with documentation route enabled
- `npm run tsc` - Run TypeScript compiler across all packages
- `npm run prisma:generate` - Generate Prisma client

## Database Schema

MWS uses Prisma with SQLite for data persistence. The schema includes:

### Core Entities

- **Users**: User accounts with authentication
- **Roles**: Role-based access control
- **Bags**: Content containers (equivalent to TiddlyWiki bags)
- **Recipes**: Content aggregation (combines multiple bags)
- **Tiddlers**: Individual content items
- **Fields**: Tiddler metadata and content
- **Sessions**: User session management
- **ACL**: Access control lists for bags and recipes

### Key Relationships

```
Users ←→ Roles (many-to-many)
Users → Sessions (one-to-many)
Bags → Tiddlers (one-to-many)
Recipes → Recipe_bags (one-to-many)
Recipe_bags → Bags (many-to-one)
Tiddlers → Fields (one-to-many)
Bags/Recipes → ACL (one-to-many)
```

## CLI Commands

MWS provides a comprehensive CLI for administration:

### listen
Start the web server with specified configuration.

```bash
npx mws listen [options]
```

**Options:**
- `--port <number>` - Port number (default: 8080)
- `--host <address>` - Host address (default: localhost)
- `--prefix <path>` - URL prefix
- `--key <file>` - SSL private key file
- `--cert <file>` - SSL certificate file

### manager
Administrative tasks for user and content management.

```bash
npx mws manager [command]
```

### load-wiki-folder
Import TiddlyWiki folder format into MWS.

```bash
npx mws load-wiki-folder <path>
```

### save-archive / load-archive
Backup and restore functionality.

```bash
npx mws save-archive <output-file>
npx mws load-archive <input-file>
```

## Configuration

### Environment Variables

- `DATABASE_URL` - Database connection string
- `ENABLE_DEV_SERVER` - Enable development mode
- `ENABLE_DOCS_ROUTE` - Enable documentation routes
- `PRISMA_CLIENT_FORCE_WASM` - Force WASM client for Prisma

### Configuration Files

- `mws.dev.mjs` - Development configuration
- `prisma/schema.prisma` - Database schema
- `tsconfig.*.json` - TypeScript configurations
- `package.json` - Package dependencies and scripts

## API Reference

### REST Endpoints

The server provides RESTful APIs for:

- User management (`/api/users`)
- Wiki operations (`/api/wikis`)
- Content management (`/api/tiddlers`)
- Authentication (`/api/auth`)

### Event System

Key events in the system:

- `mws.init.before/after` - Server initialization
- `mws.router.init` - Router setup
- `mws.routes.*` - Route registration
- `cli.register` - Command registration
- `request.streamer` - Request processing

## Deployment

### Production Build

1. **Build the project:**
   ```bash
   npm run build
   ```

2. **Install production dependencies:**
   ```bash
   npm ci --production
   ```

3. **Run the server:**
   ```bash
   npm start
   ```

### Docker Deployment

A Dockerfile and docker-compose configuration are available for containerized deployment.

### Environment Setup

- Ensure proper file permissions for data directories
- Configure SSL certificates for HTTPS
- Set up proper backup procedures for the SQLite database
- Monitor logs for performance and errors

## Security Considerations

> **⚠️ Warning**: MWS is not yet ready for production use with sensitive data.

Current security limitations:
- Authentication system is still in development
- Access control mechanisms need hardening
- CSRF protection needs review
- Input validation requires strengthening

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Development Guidelines

- Follow TypeScript best practices
- Maintain type safety throughout
- Use the event system for component communication
- Write clear, documented code
- Test your changes thoroughly

## License

This project is licensed under the BSD-3-Clause License.

## Support

- [GitHub Discussions](https://github.com/TiddlyWiki/MultiWikiServer/discussions)
- [GitHub Issues](https://github.com/TiddlyWiki/MultiWikiServer/issues)
- [TiddlyWiki Community](https://talk.tiddlywiki.org/)