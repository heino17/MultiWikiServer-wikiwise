import { exec, execSync } from "child_process";
import { existsSync, rmSync } from "fs";
function rmdb() {
  if(existsSync("wiki/store/database.sqlite"))
    rmSync("wiki/store/database.sqlite");
}
function run(cmd, env) {
  execSync(cmd, { env: { ...process.env, ...env }, stdio: "inherit" })
}

rmdb();
run("node --enable-source-maps mws.run.mjs --tests-complete", { RUN_OLD_MWS_DB_SETUP_FOR_TESTING: "yes" });
rmdb();
run("node --enable-source-maps mws.run.mjs --mws-init-store --tests-complete", {});
