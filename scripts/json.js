
globalThis.stdinJSON = new Promise(resolve => {
  const chunks = [];
  process.stdin.on("data", chunk => chunks.push(chunk));
  process.stdin.on("end", () => {
    resolve(JSON.parse(Buffer.concat(chunks).toString()));
  });
})
