if(require("fs").existsSync("wiki/store/database.sqlite"))
  require("fs").rmSync("wiki/store/database.sqlite");