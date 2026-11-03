/**
 * Worker do app de finanças.
 *
 * - Serve o app (pasta public/) como arquivos estáticos.
 * - Guarda "cofres": blocos de dados JÁ CRIPTOGRAFADOS no aparelho da pessoa (AES-GCM,
 *   chave derivada da senha dela). O servidor nunca recebe a senha nem a chave, só:
 *     • um id (hash do nome de usuário),
 *     • o hash de um token de acesso (derivado da senha, separado da chave de criptografia),
 *     • o conteúdo cifrado.
 *   Quem administra a conta Cloudflare vê apenas esses valores ilegíveis.
 *
 * API:
 *   GET /api/cofre/:id   Authorization: Bearer <token>  -> { versao, dados, atualizadoEm }
 *   PUT /api/cofre/:id   Authorization: Bearer <token>  body { versao, dados }
 *       versao = versão que o aparelho conhece (0 para criar). Se outra versão já foi
 *       gravada por outro aparelho, responde 409 com a versão atual.
 */

const LIMITE_BYTES = 5 * 1024 * 1024;
const HEX64 = /^[0-9a-f]{64}$/;

const json = (obj, status = 200) => new Response(JSON.stringify(obj), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

async function sha256Hex(texto) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** comparação em tempo constante de duas strings hex do mesmo tamanho */
function iguais(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function cofre(req, env, id) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!HEX64.test(token)) return json({ erro: 'token ausente' }, 401);
  const tokenHash = await sha256Hex(token);
  const registro = await env.COFRES.get(id, 'json');
  const autorizado = registro && iguais(registro.tokenHash, tokenHash);

  if (req.method === 'GET') {
    if (!registro) return json({ erro: 'não encontrado' }, 404);
    if (!autorizado) return json({ erro: 'usuário ou senha incorretos' }, 401);
    return json({ versao: registro.versao, dados: registro.dados, atualizadoEm: registro.atualizadoEm });
  }

  if (req.method === 'PUT') {
    const tamanho = Number(req.headers.get('content-length') || 0);
    if (tamanho > LIMITE_BYTES) return json({ erro: 'dados grandes demais' }, 413);
    const texto = await req.text();
    if (texto.length > LIMITE_BYTES) return json({ erro: 'dados grandes demais' }, 413);
    let corpo;
    try { corpo = JSON.parse(texto); } catch { return json({ erro: 'json inválido' }, 400); }
    const { versao, dados } = corpo || {};
    if (!Number.isInteger(versao) || !dados || typeof dados.iv !== 'string' || typeof dados.ct !== 'string') {
      return json({ erro: 'formato inválido' }, 400);
    }
    if (registro && !autorizado) return json({ erro: 'usuário ou senha incorretos' }, 401);
    const atual = registro ? registro.versao : 0;
    if (versao !== atual) return json({ erro: 'conflito', versao: atual }, 409);
    const novo = { tokenHash, versao: atual + 1, dados, atualizadoEm: new Date().toISOString() };
    await env.COFRES.put(id, JSON.stringify(novo));
    return json({ versao: novo.versao, atualizadoEm: novo.atualizadoEm });
  }

  return json({ erro: 'método não permitido' }, 405);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/api/ping') return json({ ok: true });
    const m = url.pathname.match(/^\/api\/cofre\/([^/]+)$/);
    if (m) {
      if (!HEX64.test(m[1])) return json({ erro: 'id inválido' }, 400);
      return cofre(req, env, m[1]);
    }
    return env.ASSETS.fetch(req);
  },
};
