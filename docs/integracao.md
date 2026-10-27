# How to coletar artigos do Valete+ com uma sessão autorizada

Este guia mostra como ler uma página, avançar o cursor e limitar a coleta a um autor. Ele não implementa login automático nem um scraper em produção.

[Referência da API](api-valete.md) · [OpenAPI](openapi.json)

## Pré-requisitos

- Conta com acesso ao conteúdo pretendido e permissão para o uso desejado.
- Sessão válida em `https://app.valete.org.br`.
- Para o exemplo JavaScript: navegador moderno, já logado, na origem do app. O código não usa bibliotecas nem lê cookies/tokens.
- Para chamadas externas com cURL: arquivo privado de cookies, já provisionado por um processo autorizado. Esta pesquisa não gerou esse arquivo.

Não cole credenciais, headers de autenticação nem exports de sessão em chats ou issues. Não versione o perfil do navegador ou arquivos de cookies.

## 1. Leia uma página

O exemplo abaixo executa **GET apenas**. Use-o no contexto de uma página do app já autenticada. Não é um script Node com autenticação automática: o navegador fornece a sessão existente.

```javascript
async function getArticlePage({ lastId, authorId } = {}) {
  for (const value of [lastId, authorId]) {
    if (value !== undefined && (typeof value !== 'string' || !value.trim())) {
      throw new TypeError('lastId e authorId devem ser strings não vazias.');
    }
  }

  const url = new URL(
    authorId ? '/api/creator/post' : '/api/post',
    'https://app.valete.org.br',
  );
  url.searchParams.set('filter', 'articles');
  if (authorId) url.searchParams.set('id', authorId);
  if (lastId) url.searchParams.set('lastId', lastId);

  const response = await fetch(url, {
    credentials: 'include',
    redirect: 'error',
    headers: { Accept: 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Valete respondeu HTTP ${response.status}.`);
  if (!(response.headers.get('content-type') || '').includes('application/json')) {
    throw new Error('Resposta não JSON. Verifique a sessão antes de continuar.');
  }

  const posts = await response.json();
  if (!Array.isArray(posts) || posts.some(post =>
    !post || typeof post !== 'object' || typeof post.id !== 'string' || !post.id
  )) {
    throw new Error('Formato do feed mudou: esperado array de posts com id.');
  }
  return posts;
}
```

Depois de definir a função:

```javascript
const firstPage = await getArticlePage();
console.table(firstPage.map(post => ({
  postId: post.id,
  articleId: post.Article?.id,
  title: post.Article?.title,
  author: post.Author?.handle,
  publishedAt: post.publishedAt,
  htmlLength: post.Article?.body?.length,
})));
```

**Verificação:** espere um array JSON. Na pesquisa, a primeira página tinha 15 itens, todos com `Article.body`. Isso não garante texto integral de todo conteúdo, especialmente material sujeito a permissões diferentes.

A função rejeita HTTP de erro e HTML. `redirect: 'error'` bloqueia a ida ao login em vez de confundir o HTML com uma resposta válida. Uma sessão expirada pode, portanto, produzir erro de rede/redirecionamento antes da validação de tipo de conteúdo.

## 2. Avance uma página sem confundir os IDs

```javascript
const lastId = firstPage.at(-1)?.id;
const secondPage = lastId ? await getArticlePage({ lastId }) : [];
console.log({ firstPage: firstPage.length, secondPage: secondPage.length });
```

A segunda página do feed de artigos foi testada ao vivo. Para uma coleta maior:

1. Processe a página e grave os registros com chave única `(fonte, post.id)`.
2. Calcule o próximo cursor a partir do **último item bruto**, antes de filtrar ou deduplicar.
3. Pare ao receber `[]`, atingir seu limite de páginas/data ou detectar cursor repetido.
4. Só grave um checkpoint depois de persistir a página com sucesso. Uma nova execução pode repetir a página, mas não deve perder itens.
5. Busque páginas em sequência, sem paralelismo agressivo. Não foi medido um intervalo seguro nem um limite oficial de chamadas.

Não pare só porque a página tem menos de 15 itens: esse tamanho não é um contrato. Para atualização incremental, releia as páginas recentes com deduplicação. Interromper no primeiro post conhecido pode perder outros itens ou alterações, e não se deve assumir ordenação temporal perfeita com posts fixados.

## 3. Colete artigos de um autor/organização

O identificador correto vem de `post.Author.id`:

```javascript
const authorId = firstPage[0]?.Author?.id;
if (typeof authorId === 'string' && authorId) {
  const authorPage = await getArticlePage({ authorId });
  console.log({ author: authorId, count: authorPage.length });
}
```

Não use `Article.authorId`: na resposta observada ele é numérico e pertence a outro espaço de IDs. O `handle` é útil para exibição, mas não substitui o `id` da rota.

O cliente do perfil também usa `lastId` para paginação. Esse caminho foi confirmado no JavaScript do site, mas a segunda página de autor não foi testada ao vivo.

## 4. Faça chamadas externas com cURL

A sessão do navegador não é herdada por outro processo ou projeto. Se você já tem um arquivo privado de cookies válido para o app, defina apenas seu **caminho**:

```bash
export VALETE_COOKIE_FILE='/caminho/privado/valete.cookies.txt'
```

Restrinja o arquivo ao usuário do processo e mantenha-o fora do repositório. Não coloque o valor de cookies em argumentos de shell, exemplos, `.env` versionado ou logs.

```bash
curl --silent --show-error --fail-with-body \
  --connect-timeout 10 --max-time 30 \
  --cookie "$VALETE_COOKIE_FILE" \
  --header 'Accept: application/json' \
  --get 'https://app.valete.org.br/api/post' \
  --data-urlencode 'filter=articles'
```

Próxima página:

```bash
curl --silent --show-error --fail-with-body \
  --connect-timeout 10 --max-time 30 \
  --cookie "$VALETE_COOKIE_FILE" \
  --header 'Accept: application/json' \
  --get 'https://app.valete.org.br/api/post' \
  --data-urlencode 'filter=articles' \
  --data-urlencode 'lastId=POST_ID_DA_ULTIMA_LINHA'
```

Busca:

```bash
curl --silent --show-error --fail-with-body \
  --connect-timeout 10 --max-time 30 \
  --cookie "$VALETE_COOKIE_FILE" \
  --header 'Accept: application/json' \
  --get 'https://app.valete.org.br/api/search' \
  --data-urlencode 'query=Paracelso'
```

Esses comandos não seguem redirecionamentos. Ainda assim, cURL pode encerrar com código zero diante de um `3xx`; uma integração precisa validar **status 200, tipo JSON e array** antes de persistir. Os comandos externos não foram executados com cookies nesta pesquisa; os endpoints equivalentes foram verificados dentro do navegador autenticado.

## 5. Normalize para seu agregador

Mapeamento sugerido, não um contrato da API:

| Campo no agregador | Origem |
| --- | --- |
| `source` | Constante `valete` |
| `source_post_id` | `post.id` |
| `source_article_id` | `post.Article.id` |
| `title` | `post.Article.title` |
| `summary` | `post.Article.subtitle` |
| `body_html` | `post.Article.body` |
| `cover_url` | `post.Article.imageUri` |
| `author_id` | `post.Article.Author.id` ou `post.Author.id` |
| `author_name` | Assinatura editorial disponível: `post.Article.bylineName` / `post.Article.BylineAuthor.name`; guarde a organização separadamente |
| `published_at` | `post.publishedAt`, com fallback explícito para `post.createdAt` |
| `fetched_at` | Horário UTC da sua coleta |

Guarde os IDs de post e artigo separadamente. Para eliminar duplicação editorial causada por reposts, considere `Article.id` e `OriginalPost`, sem perder os IDs das publicações que o referenciam. O feed `articles` observado trouxe artigos diretos; o comportamento com todos os tipos de repost não foi validado.

Não grave cookies, `liked`, `isBookmarked` ou outros estados pessoais no registro público da notícia. Também não replique o HTML completo sem autorização para esse uso.

### Segurança do conteúdo

Trate HTML, links e imagens como dados não confiáveis:

- Sanitize HTML antes de renderizar; não injete `Article.body` diretamente numa interface.
- Para texto puro, use um parser HTML adequado, não remoção de tags por regex.
- Se seu servidor baixar imagens/links, valide protocolos, hosts e IPs, inclusive após redirecionamento. Não permita acesso a rede interna, loopback ou endpoints de metadados. Isso evita SSRF, quando uma URL do conteúdo induz o servidor a acessar recursos privados.
- Não baixe mídias de terceiros automaticamente só porque aparecem em `srcset` ou no corpo do artigo.

## Solução de problemas

| Sintoma | Próxima ação |
| --- | --- |
| `Unexpected token '<'` ao interpretar JSON | Inspecione status, URL final e `Content-Type`; pode ser login ou 404 HTML. |
| Erro de fetch/redirecionamento | Confirme sessão e conectividade. Não desative a proteção para seguir login silenciosamente. |
| HTTP 401/403 | Interrompa e confirme acesso da conta. Não contorne assinatura/permissões. |
| HTTP 429 | Respeite `Retry-After`, reduza frequência e limite retentativas. |
| Busca sem corpo da matéria | É esperado na amostra. Colete o feed de artigos; não use a rota `by-id`, que retornou 404. |
| Cursor não avança | Pare a execução, registre apenas IDs não sensíveis e revise a paginação. |
| Outro projeto não tem a sessão | Provisione autenticação de forma privada. Login neste navegador não autentica cURL, Node ou outro domínio automaticamente. |
| Campos novos/ausentes | Preserve compatibilidade, revise o esquema e não descarte dados já persistidos. |

## Verificação local dos exemplos

Na raiz deste repositório, com Node.js 18 ou superior:

```bash
node --test tests/documentation.test.cjs
```

Os testes executam a função JavaScript **extraída deste Markdown** com respostas simuladas e checam links e referências locais do OpenAPI. Não acessam a conta e não substituem os testes ao vivo descritos na [referência](api-valete.md#6-evidências-e-cobertura).
