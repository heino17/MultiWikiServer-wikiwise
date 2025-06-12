# MWS Server Architecture Explained

The MWS server architecture follows a clean separation of concerns with three distinct layers:

## 1. Interface Layers
- **CLI Commands**: Command-line interface for server configuration and maintenance tasks
- **Web Routes**: HTTP endpoints that handle incoming requests for admin and wiki functionality
- **Database**: Application logic that reads from and writes to the database. 

## 2. Data Flow
The architecture follows this pattern:
1. **Request Reception**: Commands or HTTP requests arrive at their respective interface
2. **Data Normalization**: Input is validated and transformed into a consistent format
3. **Core Logic Execution**: Normalized data is passed to the appropriate methods in the database layer.
4. **Response Delivery**: Results from the database layer are returned to the client

## 3. Package Organization
- **Commander Package**: Handles CLI parsing and command execution
- **Server Package**: Manages web request routing, validation, and responses
- **MWS Package**: Contains the database logic and business rules
- **Events Package**: Provides communication between the other packages

## 4. Independence and Reusability
Each layer has clear boundaries and responsibilities, allowing the components to be:
- Developed together but maintained separately
- Reused in different contexts
- Published as independent packages

## User Interface

The user experience involves three separate interfaces working together: the cli, the admin, and the wiki. 

- The cli handles settings specific to the webserver, especially those which could make the site unreachable if configured incorrectly. It also has some commands to help with server maintenance. 
- The admin manages users, roles, bags, recipes, site settings, and anything else that needs to be configured for the site. 
- The wiki handles all tiddler and TW5-related routes. 

## Package Details

MWS is divided into separate packages mostly because they are logically separate concerns:

- **Server Package**: Provides request routing, handling, validation, response, compression, and all web-related request/response functionality. Designed to be flexible and reusable.
- **Commander Package**: Handles CLI parsing and command execution through registered events.
- **Events Package**: Provides communication between packages, allowing commander and server to be used independently.
- **MWS Package**: Contains database logic and extends server/commander types. Most logic can be found in `packages/mws/src/register*.ts`.
- **React-Admin Package**: Builds the browser client, using MWS types for server requests/responses.
- **TiddlyWiki-Types Package**: Provides TypeScript definitions for TiddlyWiki.

## Plugins Architecture

- **Server Plugin**: Loaded into TW5 instance for cache file generation. Library tiddlers with `library: yes` are "hoisted".
- **Client Plugin**: Contains sync adapter and related tiddlers, loaded and cached on startup.

## Repository Structure

- **dev/**
  - Development-related files
  - Contains dev wiki folder and SSL certificate generation scripts
- **dist/**
  - Build folder for server code
- **editions/**
  - Contains MWS site tiddlers in mws-docs
- **packages/**
  - Core MWS code modules
- **plugins/**
  - Client and server TiddlyWiki plugins
- **prisma/**
  - Database schema and migration files
- **Root Files**
  - mws.dev.mjs: Development binary
  - scripts.mjs: Cross-platform operation scripts
  - tsconfig files: TypeScript configuration
  - tsup.config.ts: Build configuration

This architecture promotes code maintainability, testability, and separation of concerns while providing flexibility as the API matures.

