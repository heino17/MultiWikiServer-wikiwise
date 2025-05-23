import * as path from "path";
import * as fs from "fs";
import type { Prisma } from "@prisma/client";
import { ServerState } from "./ServerState";


declare global {
  namespace PrismaJson {
    type Recipes_plugin_names = string[];
  }
}

declare global {
  type PrismaTxnClient = Omit<ServerState["engine"], "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">
  type ART<T extends (...args: any) => any> = Awaited<ReturnType<T>>
  type Complete<T> = { [K in keyof T]-?: T[K] }
  interface ObjectConstructor { keys<T>(t: T): (string & keyof T)[]; }
  /** 
   * This primarily makes sure that positional arguments are used correctly
   * (so you can't switch a title and bag_name around).
   * 
   * If you assign the wrong value (like `5 as PrismaField<"Bags", "bag_name">`), 
   * this will result in a type error on the as keyword, allowing you to catch incorrect types quickly.
  */
  type PrismaField<T extends Prisma.ModelName, K extends keyof PrismaPayloadScalars<T>> =
    // manually map foriegn keys to their corresponding primary key so comparisons work
    // this should remove the need for any global helper functions to convert between types
    (
      // [T, K] extends ["Acl", "role_id"] ? PrismaField<"Roles", "role_id"> :
      // [T, K] extends ["", "role_id"] ? PrismaField<"Roles", "role_id"> :
      [T, K] extends ["Tiddlers", "bag_id"] ? PrismaField<"Bags", "bag_id"> :
      [T, K] extends ["Sessions", "user_id"] ? PrismaField<"Users", "user_id"> :
      [T, K] extends ["Recipe_bags", "bag_id"] ? PrismaField<"Bags", "bag_id"> :
      [T, K] extends ["Recipe_bags", "recipe_id"] ? PrismaField<"Recipes", "recipe_id"> :
      [T, K] extends ["Recipes", "owner_id"] ? PrismaField<"Users", "user_id"> :
      [T, K] extends ["Bags", "owner_id"] ? PrismaField<"Users", "user_id"> :
      (PrismaPayloadScalars<T>[K] & { __prisma_table: T, __prisma_field: K })
    ) | (null extends PrismaPayloadScalars<T>[K] ? null : never);

  type PrismaPayloadScalars<T extends Prisma.ModelName>
    = Prisma.TypeMap["model"][T]["payload"]["scalars"]

  type EntityName<T extends EntityType> =
    T extends "bag" ? PrismaField<"Bags", "bag_name"> :
    T extends "recipe" ? PrismaField<"Recipes", "recipe_name"> :
    never;

  type EntityType = "recipe" | "bag";

  type ACLPermissionName = "READ" | "WRITE" | "ADMIN";
}


// declare global { const ok: typeof assert.ok; }
// (global as any).ok = assert.ok;

// these are some $tw.utils functions that seemed important enough to just copy across
declare global {
  function hop(object: any, property: any): boolean;
  function each<T>(object: T[], callback: (value: T, index: number, object: T[]) => void): void;
  function each<T>(object: Record<string, T>, callback: (value: T, key: string, object: Record<string, T>) => void): void;
  function eachAsync<T>(object: T[], callback: (value: T, index: number, object: T[]) => void): Promise<void>;
  function eachAsync<T>(object: Record<string, T>, callback: (value: T, key: string, object: Record<string, T>) => void): Promise<void>;
  function createDirectory(dirPath: string): void;
  function deleteDirectory(dirPath: string): void;
  function encodeURIComponentExtended(s: string): string;
}

(global as any).hop = function (object: any, property: any) {
  return object ? Object.prototype.hasOwnProperty.call(object, property) : false;
};

(global as any).eachAsync = async function (object: any, callback: any) {
  var next, f, length;
  if (object) {
    if (Object.prototype.toString.call(object) == "[object Array]") {
      for (f = 0, length = object.length; f < length; f++) {
        next = await callback(object[f], f, object);
        if (next === false) {
          break;
        }
      }
    } else {
      var keys = Object.keys(object);
      for (f = 0, length = keys.length; f < length; f++) {
        var key = keys[f];
        next = await callback(object[key as string], key, object);
        if (next === false) {
          break;
        }
      }
    }
  }
};

(global as any).each = function (object: any, callback: any) {
  var next, f, length;
  if (object) {
    if (Object.prototype.toString.call(object) == "[object Array]") {
      for (f = 0, length = object.length; f < length; f++) {
        next = callback(object[f], f, object);
        if (next === false) {
          break;
        }
      }
    } else {
      var keys = Object.keys(object);
      for (f = 0, length = keys.length; f < length; f++) {
        var key = keys[f];
        next = callback(object[key as string], key, object);
        if (next === false) {
          break;
        }
      }
    }
  }
};

(global as any).createDirectory = function (dirPath: string) {
  if (dirPath.substr(dirPath.length - 1, 1) !== path.sep) {
    dirPath = dirPath + path.sep;
  }
  var pos = 1;
  pos = dirPath.indexOf(path.sep, pos);
  while (pos !== -1) {
    var subDirPath = dirPath.substr(0, pos);
    if (!(fs.existsSync(subDirPath) && fs.statSync(subDirPath).isDirectory())) {
      try {
        fs.mkdirSync(subDirPath);
      } catch (e) {
        return "Error creating directory '" + subDirPath + "'";
      }
    }
    pos = dirPath.indexOf(path.sep, pos + 1);
  }
  return null;
};

(global as any).deleteDirectory = function deleteDirectory(dirPath: string) {
  if (fs.existsSync(dirPath)) {
    var entries = fs.readdirSync(dirPath);
    for (var entryIndex = 0; entryIndex < entries.length; entryIndex++) {
      var currPath = dirPath + path.sep + entries[entryIndex];
      if (fs.lstatSync(currPath).isDirectory()) {
        deleteDirectory(currPath);
      } else {
        fs.unlinkSync(currPath);
      }
    }
    fs.rmdirSync(dirPath);
  }
  return null;
};

(global as any).encodeURIComponentExtended = function (s: string) {
  return encodeURIComponent(s).replace(/[!'()*]/g, function (c) {
    return "%" + c.charCodeAt(0).toString(16).toUpperCase();
  });
};

