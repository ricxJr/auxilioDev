# CODEX_BEST_PRACTICES

Boas práticas de manutenção para o AI Codex neste projeto.

## 1) Organização e legibilidade
- Preferir funções pequenas e com responsabilidade única.
- Manter funções puras sem efeitos colaterais para parsing/agregação/format.
- Comentar decisões de negócio ("por quê") e não o óbvio do código.
- Evitar duplicação de lógica de validação entre criação e edição.

## 2) Convenções de estado
- Toda alteração deve passar por um ponto central de atualização de `state`.
- Derivar UI sempre do estado atual (não manter "estado paralelo" no DOM).
- Após mutações (CRUD), executar persistência e depois re-render.

## 3) CSV e persistência
- Validar cabeçalho esperado antes de processar conteúdo.
- Sanitizar campos de CSV com aspas duplas quando necessário.
- Manter ordenação determinística na serialização.
- Nunca perder `personId` ao reprocessar dados.
- Em conflito de IDs, priorizar transparência: alertar claramente na interface.

## 4) Regras de validação
- Nome obrigatório após `trim`.
- Data obrigatória no formato `YYYY-MM-DD`.
- Duração deve resultar em inteiro > 0.
- Formatos de duração aceitos: `90`, `1:30`, `1h 30m`.

## 5) UX mínima consistente
- Sempre informar sucesso/erro com toast simples.
- Confirmar exclusão de ocorrência.
- Mostrar status de persistência (conectado/fallback) de forma visível.
- Mensagens de erro devem indicar como corrigir a entrada.

## 6) Compatibilidade e fallback
- File System Access API como estratégia principal quando disponível.
- Import/export manual como fallback obrigatório.
- Não depender de backend, Node.js ou bibliotecas externas.

## 7) Checklist antes de commit
- CRUD funcionando (criar/editar/excluir).
- Dashboard diário consistente com tabela.
- Gráfico atualizado ao mudar filtros/modo.
- CSV exportado com colunas e ordem corretas.
- Lint/manual review de nomes e consistência das funções puras.
