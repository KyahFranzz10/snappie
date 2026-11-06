import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { createHash } from "node:crypto";
import type { Plugin } from "vite";
// Precache build assets only. No API, credentials, room URLs, or user images enter a cache.
export function offlinePlugin(): Plugin {
  let outDir = "dist";
  return {
    name: "snapbooth-offline",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    async closeBundle() {
      const files: string[] = [];
      async function walk(dir: string) {
        for (const f of await readdir(dir, { withFileTypes: true })) {
          const path = join(dir, f.name);
          if (f.isDirectory()) await walk(path);
          else if (
            /\.(html|js|css|jpg|png|svg|webmanifest|woff2)$/.test(f.name) &&
            f.name !== "sw.js"
          )
            files.push(path);
        }
      }
      await walk(outDir);
      const hash = createHash("sha256");
      for (const f of files) hash.update(await readFile(f));
      const version = hash.digest("hex").slice(0, 16);
      const assets = files.map(
        (f) => "/" + relative(outDir, f).replaceAll("\\", "/"),
      );
      await writeFile(
        join(outDir, "sw.js"),
        `const CACHE='snapbooth-${version}';const ASSETS=${JSON.stringify(assets)};
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('snapbooth-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('message',event=>{if(event.data==='ACTIVATE_UPDATE')self.skipWaiting();});
self.addEventListener('fetch',event=>{const url=new URL(event.request.url);if(event.request.method!=='GET'||url.origin!==self.location.origin)return;if(event.request.mode==='navigate'){event.respondWith(caches.open(CACHE).then(cache=>cache.match('/index.html')).then(cached=>cached||fetch(event.request)));return;}if(ASSETS.includes(url.pathname)){event.respondWith(caches.open(CACHE).then(cache=>cache.match(url.pathname)).then(cached=>cached||fetch(event.request)));}});`,
      );
    },
  };
}
