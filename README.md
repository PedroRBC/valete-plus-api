<img src="assets/icon.svg" width="64" height="64" alt="">

# valete-plus-api

Documentação não oficial da API de leitura de notícias do [Valete+](https://app.valete.org.br), observada com sessão autorizada em 27/10/2026.

## Documentação

- [Referência da API](docs/api-valete.md): rotas, autenticação observada, campos, paginação e limitações.
- [Guia de integração](docs/integracao.md): exemplos JavaScript/cURL e cuidados para um agregador de notícias.
- [OpenAPI 3.1](docs/openapi.json): especificação JSON para levar ao outro projeto.

A listagem `GET /api/post?filter=articles` trouxe o corpo HTML dos artigos da amostra. A API requer sessão do app e pode devolver HTML de login mesmo com status final `200`. Nenhuma credencial está incluída.

## Verificação dos exemplos

Com Node.js 18 ou superior, sem instalar dependências:

```bash
node --test tests/documentation.test.cjs
```

Os testes locais usam respostas simuladas. A evidência das chamadas reais e o que não foi validado estão na referência. Este repositório contém documentação, não um serviço de scraping.

Created in [T3 Code](https://t3.codes).
