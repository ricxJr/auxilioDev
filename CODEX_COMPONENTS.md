# CODEX_COMPONENTS

Este documento descreve os principais componentes da aplicação para facilitar a navegação do AI Codex.

## Visão geral de arquivos
- `index.html`: estrutura da UI (header/status CSV, formulário, dashboard, gráfico e tabela).
- `styles.css`: sistema visual, layout responsivo, estados de validação e componentes visuais.
- `app.js`: estado global, regras de negócio, renderização, persistência em CSV e integração com File System Access API.

## Componentes de UI (alto nível)
1. **Header + Status de Persistência**
   - Exibe se está em modo conectado (FS API) ou fallback (import/export).
   - Ações principais: conectar CSV, importar, exportar.

2. **Formulário de Auxílio**
   - Entrada de nome com sugestões.
   - Data da auxílio (padrão: hoje).
   - Duração (normalizada para minutos internamente).
   - Exibe ID de pessoa associado (existente ou próximo ID previsto).

3. **Dashboard do Dia**
   - Total de tempo do dia.
   - Total de pessoas distintas.
   - Resumo por pessoa ordenado por tempo.

4. **Gráfico em Canvas**
   - Barras por pessoa com total de minutos.
   - Modo diário (padrão) e histórico.
   - Tooltip ao passar o mouse.

5. **Tabela de Auxílios**
   - Colunas: data, pessoa (nome + ID), duração, ações.
   - Filtros por data, pessoa e texto.
   - Ações de editar/excluir.

## Estado e fluxo de dados
A aplicação segue um estado central com formato esperado:

```js
state = {
  people: Map,
  occurrences: [],
  filters: {},
  csv: {}
}
```

### Fluxo padrão
1. Carrega CSV (conectado ou importado).
2. Reconstrói pessoas/auxílios em memória.
3. Renderiza formulário, dashboard, gráfico e tabela.
4. Ao CRUD, atualiza estado e persiste no CSV.
5. Re-renderiza UI derivada do estado.

## Funções puras esperadas
- `parseCSV()`
- `serializeCSV()`
- `normalizeName()`
- `formatDuration()`
- `aggregateByDay()`
- `aggregateByPerson()`

## Regras críticas do domínio
- Nome de pessoa deve ser único por comparação case-insensitive e normalizada.
- `personId` deve permanecer estável entre leituras/escritas de CSV.
- Duração sempre persistida em minutos.
- Escrita CSV determinística (ordem por data asc + createdAt asc).
