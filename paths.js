// Onde ficam os dados. Sem DATA_DIR (uso local) nada muda: tudo na pasta do projeto.
// Com DATA_DIR (ex.: /data num volume do Docker) tudo que muda em produção fica nesse
// disco persistente: banners.json, uploads/, data.js e a senha.
const path = require("path");

const ROOT = __dirname;
const external = !!process.env.DATA_DIR;
const DATA_DIR = external ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, "data");

module.exports = {
  ROOT,
  external,
  DATA_DIR,
  DB_FILE: path.join(DATA_DIR, "banners.json"),
  DATA_JS: external ? path.join(DATA_DIR, "data.js") : path.join(ROOT, "data.js"),
  UPLOAD_DIR: external ? path.join(DATA_DIR, "uploads") : path.join(ROOT, "uploads"),
};
