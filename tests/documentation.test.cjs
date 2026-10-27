const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..');
const guide = fs.readFileSync(path.join(root, 'docs/integracao.md'), 'utf8');
const blocks = [...guide.matchAll(/```javascript\n([\s\S]*?)```/g)].map(match => match[1]);
assert.ok(blocks[0]?.includes('async function getArticlePage('));

function loadClient(fetch) {
  return vm.runInNewContext(`${blocks[0]}\ngetArticlePage;`, { fetch, URL, AbortSignal });
}

function response(body, { status = 200, contentType = 'application/json' } = {}) {
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: name => name === 'content-type' ? contentType : null },
    json: async () => body,
  };
}

test('exemplo faz GET com sessão, timeout e proteção de redirecionamento', async () => {
  const posts = [{ id: 'post-1', Article: { title: 'Exemplo', body: '<p>Texto</p>' } }];
  const getArticlePage = loadClient(async (url, options) => {
    assert.equal(url.href, 'https://app.valete.org.br/api/post?filter=articles');
    assert.equal(options.method ?? 'GET', 'GET');
    assert.equal(options.credentials, 'include');
    assert.equal(options.redirect, 'error');
    assert.equal(options.headers.Accept, 'application/json');
    assert.ok(options.signal);
    assert.equal(options.body, undefined);
    return response(posts);
  });
  assert.equal(await getArticlePage(), posts);
});

test('codifica cursor e autor sem confundir os parâmetros', async () => {
  const getArticlePage = loadClient(async url => {
    assert.equal(url.origin, 'https://app.valete.org.br');
    assert.equal(url.pathname, '/api/creator/post');
    assert.equal(url.searchParams.get('filter'), 'articles');
    assert.equal(url.searchParams.get('id'), 'author & id');
    assert.equal(url.searchParams.get('lastId'), 'cursor?&/+=');
    assert.equal([...url.searchParams].length, 3);
    return response([]);
  });
  assert.equal((await getArticlePage({ authorId: 'author & id', lastId: 'cursor?&/+=' })).length, 0);
});

test('rejeita parâmetros inválidos antes de chamar a rede', async () => {
  const getArticlePage = loadClient(() => { throw new Error('Não deveria acessar a rede'); });
  for (const value of ['', '  ', null, 123, {}, []]) {
    await assert.rejects(getArticlePage({ lastId: value }), /strings não vazias/);
    await assert.rejects(getArticlePage({ authorId: value }), /strings não vazias/);
  }
});

test('rejeita erros HTTP e HTML com status 200', async () => {
  for (const status of [401, 403, 404, 429, 500]) {
    const client = loadClient(async () => response(null, { status }));
    await assert.rejects(client(), new RegExp(`HTTP ${status}`));
  }
  for (const contentType of ['text/html; charset=utf-8', '']) {
    const client = loadClient(async () => response(null, { contentType }));
    await assert.rejects(client(), /Resposta não JSON/);
  }
});

test('rejeita JSON inesperado e preserva erros de rede ou JSON inválido', async () => {
  for (const body of [null, {}, { data: [] }, [null], [{ id: 123 }], [{ id: '' }]]) {
    const client = loadClient(async () => response(body));
    await assert.rejects(client(), /Formato do feed mudou/);
  }
  const networkError = new TypeError('Failed to fetch');
  await assert.rejects(loadClient(async () => { throw networkError; })(), error => error === networkError);
  const parseError = new SyntaxError('JSON inválido');
  await assert.rejects(loadClient(async () => ({
    ...response(null),
    json: async () => { throw parseError; },
  }))(), error => error === parseError);
});

test('demais exemplos usam o último post.id como cursor e o Author.id como autor', async () => {
  const calls = [];
  const firstPage = [{
    id: 'POST_ID',
    Author: { id: 'AUTHOR_ID' },
    Article: { id: 'ARTICLE_ID', authorId: 123, body: '<p>Exemplo</p>' },
  }];
  await vm.runInNewContext(`(async () => {\n${blocks.join('\n')}\n})()`, {
    URL,
    AbortSignal,
    console: { table() {}, log() {} },
    fetch: async url => {
      calls.push(url);
      return response(calls.length === 1 ? firstPage : []);
    },
  });
  assert.equal(calls.length, 3);
  assert.equal(calls[1].searchParams.get('lastId'), 'POST_ID');
  assert.equal(calls[2].searchParams.get('id'), 'AUTHOR_ID');
});

test('OpenAPI tem apenas operações GET e referências locais resolvíveis', () => {
  const spec = JSON.parse(fs.readFileSync(path.join(root, 'docs/openapi.json'), 'utf8'));
  assert.equal(spec.openapi, '3.1.0');
  assert.equal(spec.servers[0].url, 'https://app.valete.org.br');
  assert.equal(spec['x-authentication'].required, true);
  assert.equal(Object.keys(spec.paths).length, 3);
  const ids = new Set();
  for (const route of Object.values(spec.paths)) {
    assert.deepEqual(Object.keys(route), ['get']);
    assert.ok(route.get.responses['200']);
    assert.ok(!ids.has(route.get.operationId));
    ids.add(route.get.operationId);
  }
  function walk(value) {
    if (!value || typeof value !== 'object') return;
    if (value.$ref) {
      assert.ok(value.$ref.startsWith('#/'));
      let target = spec;
      for (const part of value.$ref.slice(2).split('/')) {
        target = target?.[part.replace(/~1/g, '/').replace(/~0/g, '~')];
      }
      assert.ok(target, `Referência quebrada: ${value.$ref}`);
    }
    for (const child of Object.values(value)) walk(child);
  }
  walk(spec);
  const allowedMediaFields = new Set(['schema', 'example', 'examples', 'encoding']);
  const responses = [
    ...Object.values(spec.components.responses),
    ...Object.values(spec.paths).flatMap(route => Object.values(route.get.responses)),
  ];
  for (const item of responses) {
    for (const media of Object.values(item.content ?? {})) {
      for (const key of Object.keys(media)) {
        assert.ok(allowedMediaFields.has(key) || key.startsWith('x-'), `Campo de mídia inválido: ${key}`);
      }
    }
  }
});

test('comandos shell documentados têm sintaxe válida, sem executar chamadas', () => {
  const { spawnSync } = require('node:child_process');
  for (const [, command] of guide.matchAll(/```bash\n([\s\S]*?)```/g)) {
    const result = spawnSync('bash', ['-n'], { input: command, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  }
});

test('links locais do README e documentos existem', () => {
  for (const filename of ['README.md', 'docs/api-valete.md', 'docs/integracao.md']) {
    const fullPath = path.join(root, filename);
    const markdown = fs.readFileSync(fullPath, 'utf8');
    for (const [, href] of markdown.matchAll(/\]\(([^)]+)\)/g)) {
      if (/^(?:https?:|#)/.test(href)) continue;
      const target = href.split('#')[0];
      assert.ok(fs.existsSync(path.resolve(path.dirname(fullPath), target)), `${filename}: ${href}`);
    }
  }
});
