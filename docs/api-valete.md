# API de notícias do Valete+

Referência não oficial, observada em **27/10/2026** em `https://app.valete.org.br`, com login autorizado pelo titular da conta. Escopo: leitura de artigos, feed, paginação, autores e busca. Não é um contrato publicado pelo Valete nem um inventário de toda a plataforma.

## Comece aqui

- **Base:** `https://app.valete.org.br`.
- **Artigos:** `GET /api/post?filter=articles`.
- **Texto:** `post.Article.body`, em HTML. A listagem já trouxe o corpo dos artigos da amostra; não foi necessário buscar cada página.
- **Próxima página:** acrescente `lastId` com o `id` do último **post**, não o `Article.id`.
- **Autenticação:** sessão do site, enviada pelo navegador. As leituras testadas não precisaram de um cabeçalho `Authorization` configurado manualmente.
- **Atenção:** sem sessão, as chamadas testadas redirecionaram para `/login`, terminando em `200 text/html`. Status `200` sozinho não indica sucesso.

[Guia de integração](integracao.md) · [OpenAPI 3.1 em JSON](openapi.json)

## 1. Autenticação e limites da observação

O acesso inicial ao app redirecionou para `/login?redirect=%2F`; o fluxo de login levou a `https://id.valete.org.br/auth/login`. O titular entrou diretamente no navegador. Depois disso, `fetch('/api/post?filter=articles')` retornou JSON usando a sessão existente.

O JavaScript do feed faz `fetch(url)` sem inserir um Bearer token. Isso confirma o transporte usado pelo frontend nesta observação, não um método oficial de autenticação para clientes externos.

Para integrar em outro projeto:

1. Prefira credenciais de integração e permissão formal do fornecedor, se disponíveis.
2. Se o uso de uma sessão pessoal for permitido, mantenha-a em armazenamento privado, fora do Git e de logs. O cliente precisa de uma sessão válida do **app**, não apenas de estar logado em outro domínio.
3. Detecte redirecionamento, resposta HTML e expiração. Interrompa a coleta e renove o login pelo fluxo normal.

**Não verificados:** nomes e atributos dos cookies, prazo da sessão, renovação automática, endpoints de login por senha, escopos de acesso, API key, CORS ou suporte oficial a automação. Nenhum valor de cookie, token, senha ou código de login foi coletado para estes arquivos.

A chamada `/api/token` apareceu no tráfego. Um módulo de chat do cliente usa essa rota para obter um Bearer token. O corpo dessa resposta não foi inspecionado; não há evidência de que esse token autentique o feed em um projeto externo.

## 2. Endpoints de leitura confirmados

| Método | Caminho | Resultado observado |
| --- | --- | --- |
| GET | `/api/post?filter=all` | Array de 15 posts mistos, incluindo reposts |
| GET | `/api/post?filter=articles` | Array de 15 posts com `Article` |
| GET | `/api/post?filter=articles&lastId={postId}` | Página seguinte, 15 posts na amostra |
| GET | `/api/creator/post?id={authorId}&filter=articles` | 15 artigos de um autor/organização |
| GET | `/api/search?query={texto}` | Array heterogêneo de resultados |

Todos os resultados JSON acima foram `200 application/json`, com sessão válida. Os tamanhos são **observações**, não limites garantidos.

### 2.1 Feed: `GET /api/post`

| Parâmetro | Tipo | Uso / evidência |
| --- | --- | --- |
| `filter` | string | `all` e `articles` testados. O app usa `all` quando o filtro da página não existe. O padrão do servidor quando o parâmetro é omitido não foi testado. |
| `lastId` | string | Opcional na primeira página; ID do último post da página anterior. Confirmado ao buscar a segunda página de artigos. |
| `following` | string | O cliente acrescenta `following=true` quando `filter=following`. Encontrado no bundle; não testado. |

Resposta: **array JSON direto**, sem envelope `data`, `total`, `nextCursor` ou `hasMore` nos testes.

```http
GET /api/post?filter=articles HTTP/1.1
Host: app.valete.org.br
Accept: application/json
```

O frontend calcula o cursor com o último `post.id` e só encerra por página vazia ou ausência de cursor. Não há evidência de suporte a `page`, `limit`, `offset`, filtros por data ou ordenação configurável. A amostra de artigos veio em ordem decrescente de `publishedAt`, mas fixações e regras do feed podem afetar a ordem.

### 2.2 Feed de autor: `GET /api/creator/post`

| Parâmetro | Tipo | Uso / evidência |
| --- | --- | --- |
| `id` | string | Use `post.Author.id`, não o handle e não `Article.authorId`. Um UUID de organização foi testado. |
| `filter` | string | `articles` testado. Outros filtros aparecem na interface, mas não foram validados nesta rota. |
| `lastId` | string | Encontrado no código do perfil, com o mesmo algoritmo de cursor do feed. Paginação de autor não foi testada ao vivo. |

A resposta tem a mesma estrutura de posts do feed. Na amostra, os 15 itens tinham `Article`. Para descobrir `Author.id`, use os posts ou um resultado `user` da busca; não há necessidade de enumerar perfis.

### 2.3 Busca: `GET /api/search`

| Parâmetro | Tipo | Uso / evidência |
| --- | --- | --- |
| `query` | string | Texto codificado como query string. O frontend só dispara busca com mais de 2 caracteres. Essa é uma regra do cliente, não uma validação confirmada do servidor. |

Consultas testadas: `Valete`, `Brasil`, `Flávio` e `Paracelso`. Retornaram de 11 a 20 resultados. Não foi confirmada paginação de busca.

Cada resultado observado tinha `title`, `imageUrl` e um dos objetos abaixo:

| Objeto | Conteúdo observado |
| --- | --- |
| `user` | `id`, `handle`, `name`, `avatarUrl`, `about`, `type`, `stampType`, `offers` |
| `article` | `id`, `postId`, `title`, `imageUri`, `Author` |
| `content` | `id`, `title`, `moduleSlug`, `moduleName`, `moduleImageUriH` |

**Importante:** a busca usa `article` minúsculo; o feed usa `Article` maiúsculo. `result.article.id` identifica o artigo, enquanto `result.article.postId` identifica o post que o contém. A busca observada não trouxe o corpo do artigo.

## 3. Estrutura dos dados

Os tipos abaixo descrevem a amostra, não um esquema oficial. Campos podem estar ausentes, ser nulos ou variar conforme o conteúdo e a permissão. Não faça validação fechada que rejeite campos novos.

### Post

| Campo | Tipo observado | Significado / cuidado |
| --- | --- | --- |
| `id` | string | ID opaco do post. Use como cursor e chave de publicação. Não assuma comprimento fixo. |
| `type` | string | Observados `STANDARD` e `REPOST`; não é uma enumeração completa. |
| `contentType` | string | `ARTICLE` nos artigos. O feed geral contém outros conteúdos. |
| `body` | string | Texto/HTML do post. Não substitui `Article.body`. |
| `Article` | object, quando presente | Dados do artigo. |
| `Author` | object | Autor ou organização responsável pelo post. |
| `OriginalPost` | object, quando presente | Post original de um repost. Pode carregar conteúdo e autor próprios. |
| `originalPostId` | string, quando presente | Referência ao post original. |
| `createdAt`, `publishedAt` | string | Datas ISO 8601 em UTC na amostra. Use `publishedAt` para a data editorial quando disponível. |
| `status` | string | Estado da publicação; conjunto de valores não validado. |
| `likes`, `comments`, `reposts`, `views` | number | Contagens variáveis, não medidas de disponibilidade. |
| `liked`, `isBookmarked` | boolean | Estado personalizado da conta; não faz parte da notícia. |
| `pinned` | boolean | Indicador de fixação. |
| `profilePinnedAt` | null na amostra | Campo de fixação no perfil; demais tipos não confirmados. |
| `PostImages`, `Playlists`, `mentions` | array | Presentes; esquemas completos não mapeados. |
| `Space` | null na amostra | Recurso fora do escopo. |
| `minVersion` | string | Metadado do cliente; significado exato não confirmado. |
| `bylineName` | string, opcional | Também apareceu na raiz de um post de artigo. |

### Article

| Campo | Tipo observado | Significado / cuidado |
| --- | --- | --- |
| `id` | string | ID do artigo; é diferente de `post.id` nos exemplos verificados. |
| `title` | string | Título. |
| `subtitle` | string | Subtítulo. |
| `body` | string | Corpo em HTML, com parágrafos, imagens, links e possíveis embeds. |
| `imageUri` | string | Imagem de capa. |
| `authorId` | number | Identificador interno numérico. **Não** usar no parâmetro `id` do feed de autor. |
| `Author` | object | Conta/organização do artigo. |
| `bylineName` | string, opcional | Assinatura editorial em texto. |
| `BylineAuthor` | object, opcional | Conta da pessoa que assina o artigo. |
| `ArticleImages` | array | Imagens associadas; pode estar vazio mesmo quando o HTML contém imagens. |

`ArticleImages` não vazio apresentou objetos com `id` (string), `imageUri` (string), `caption` (string), `key` (string), `width` (number) e `widthPercentage` (number). Não deduza que essa lista contém todas as imagens: também há `<img>` e `srcset` no HTML.

### Author

Campos observados: `id`, `name`, `handle`, `avatarUrl`, `type`, `stampType` e `offers`. A busca também trouxe `about`. Os seis primeiros são strings na amostra; `offers` é array, cujo esquema não foi mapeado.

Não use o nome/handle como identificador imutável. `Author.type` variou entre representações do feed e da busca da mesma conta; não o trate como chave de deduplicação nem como permissão de acesso.

### Exemplo estrutural reduzido

**Sintético:** valores abaixo são placeholders, não uma resposta copiada. Campos não necessários foram omitidos.

```json
[
  {
    "id": "POST_ID_EXEMPLO",
    "type": "STANDARD",
    "contentType": "ARTICLE",
    "body": "",
    "publishedAt": "2026-10-27T12:00:00.000Z",
    "Author": {
      "id": "AUTHOR_ID_EXEMPLO",
      "handle": "autor-exemplo",
      "name": "Autor exemplo"
    },
    "Article": {
      "id": "ARTICLE_ID_EXEMPLO",
      "title": "Título da notícia",
      "subtitle": "Resumo da notícia",
      "body": "<p>Texto da notícia.</p>",
      "imageUri": "https://example.com/capa.webp",
      "authorId": 123,
      "ArticleImages": []
    }
  }
]
```

## 4. Página de artigo e rota não utilizável

Foi aberta uma página real no formato:

```text
https://app.valete.org.br/a/{slug}/{postId}
```

O HTML da página indicou uma URL canônica nesse formato. O último segmento é o **ID do post** no exemplo confirmado. O algoritmo de geração do slug não foi validado; preserve links canônicos quando disponíveis em vez de inventar slugs.

O código do cliente referencia `GET /api/post/by-id?id={postId}`, mas a chamada real com um post existente retornou **404 text/html**. Não a use como rota de detalhes. A listagem de artigos já entregou os corpos da amostra. Buscar um artigo antigo fora das páginas disponíveis ou resolver diretamente um resultado da busca continua sendo uma limitação desta documentação.

## 5. Respostas e tratamento de falhas

| Situação | Evidência / ação |
| --- | --- |
| Sessão válida | `200 application/json`, array. |
| Sem sessão em feed/busca | Redirecionamento seguido de `200 text/html` em `/login`. Detecte URL final, redirecionamento e tipo de conteúdo. |
| `/api/post/by-id` com ID existente | `404 text/html`; não fazer `response.json()` incondicionalmente. |
| `429` / `Retry-After` | Não observado nem provocado. Se ocorrer, respeite o intervalo e reduza a frequência. |
| `401`, `403`, `5xx` | Não observados nos testes de leitura autenticada. Trate-os como falha, sem assumir um formato JSON de erro. |

`Cache-Control: public, max-age=0, must-revalidate` apareceu em uma resposta de `/api/post?filter=all`. Isso não torna o endpoint público nem autoriza cache compartilhado: o feed contém estado personalizado. Não compartilhe respostas completas entre contas.

## 6. Evidências e cobertura

### Testes ao vivo, nesta sessão

- Feed geral: array de 15 posts.
- Artigos: array de 15 posts; `Article.body` presente nos 15 itens da página inspecionada. A função `getArticlePage` do guia também foi executada no navegador com a sessão válida e retornou os 15 artigos.
- Segunda página de artigos: array de 15 posts, primeiro ID diferente do início da primeira página. Não foi feito teste exaustivo de sobreposição de todos os IDs entre páginas.
- Autor: array de 15 posts, todos com `Article`.
- Busca: resultados de usuários, conteúdos de módulos e artigos, incluindo `article.postId`.
- Feed e busca com `credentials: 'omit'`: redirecionamento para login com HTML.
- Página de um artigo: carregou com título e URL canônica.
- Rota `by-id`: 404 HTML apesar de referenciada no cliente.

### Leitura estática dos bundles públicos

- `8110-6e984f9b6192256f.js`: montagem do feed, `filter`, `following`, `lastId` e atualização periódica do cliente.
- `2019-f7a306443239c92f.js`: cursor = último `id`; `fetch(url)` sem Bearer manual; referência a `by-id`.
- `page-1e4ec91dc4d009a4.js`: feed por autor e paginação com `lastId`.
- `6333-c02ead065db719d5.js`: token usado pelo módulo de chat, não confirmação de autenticação do feed por Bearer.

Os nomes dos bundles pertencem ao deploy observado e mudarão. A documentação separa comportamento executado de código que pode estar antigo ou não ser acessível.

## 7. Uso responsável e pendências

- A API é interna ao app e pode mudar sem aviso. Não há garantia de estabilidade ou completude do histórico.
- Acesso de uma conta não implica autorização para republicar matérias ou coletar conteúdo restrito. Verifique termos, direitos autorais e permissões de uso no seu produto.
- Não foram feitos testes de carga, contorno de assinatura, enumeração de usuários nem chamadas manuais de publicação, curtida, comentário ou exclusão. A navegação normal do app pode registrar visualizações e telemetria automaticamente.
- Rate limit, tamanho configurável de página, retenção, conteúdo de assinantes, expiração da sessão e coleta integral do histórico não foram validados.

Para implementar a coleta com os campos e cuidados acima, siga o [guia de integração](integracao.md).
