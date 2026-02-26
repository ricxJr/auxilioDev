# auxilioDev — Gestor de Ocorrências

## Nome do projeto
**auxilioDev (Gestor de Ocorrências)**

## Descrição
Aplicação web front-end (HTML/CSS/JS puro) para registrar, visualizar, filtrar e editar ocorrências por pessoa, com persistência em arquivo CSV.

O app funciona em dois modos:
- **Conectado**: usa **File System Access API** para ler/gravar diretamente um CSV escolhido pelo usuário.
- **Fallback**: quando a API não está disponível, permite **importar/exportar CSV** manualmente.

## Funcionalidades
- Cadastro de ocorrência com:
  - Nome da pessoa
  - Data
  - Duração (normalizada para minutos)
- Reaproveitamento de pessoa existente por nome normalizado (case-insensitive, sem acento e com espaços normalizados).
- Edição e exclusão de ocorrências.
- Dashboard diário com KPIs (total de minutos, pessoas distintas e total de ocorrências).
- Gráfico por pessoa (dia selecionado ou histórico completo).
- Tabela com filtros por pessoa, nome, data e ordenação.
- Persistência em CSV com cabeçalho validado.
- Reconexão automática do arquivo CSV quando possível.

## Tecnologias utilizadas
- **HTML5**
- **CSS3**
- **JavaScript (Vanilla)**
- **File System Access API** (quando suportada)
- **IndexedDB** (armazenamento do handle do arquivo)

## Como executar
1. Clone/baixe este repositório.
2. Abra o arquivo `index.html` no navegador.
3. Use a interface normalmente.

> Não há backend e não há etapa de build.

## Como conectar CSV (FS Access API + IndexedDB handle)
Quando o navegador suporta File System Access API:
1. Clique em **Conectar CSV**.
2. Selecione (ou crie) um arquivo `.csv`.
3. O app passa para modo conectado e salva o **file handle** no **IndexedDB**.
4. Nas próximas aberturas, o app tenta reconectar automaticamente ao mesmo arquivo, pedindo permissão quando necessário.
5. Alterações nas ocorrências são persistidas no arquivo conectado.

## Como usar fallback import/export
Quando a File System Access API não está disponível (ou se você preferir fluxo manual):
1. Clique em **Importar CSV** para carregar dados de um arquivo local.
2. Trabalhe normalmente (inclusão/edição/exclusão).
3. Clique em **Exportar CSV** para baixar o CSV atualizado.

Nesse modo, a persistência depende da ação manual de exportar.

## Estrutura do projeto
- `index.html` — estrutura da interface.
- `styles.css` — estilos da aplicação.
- `app.js` — regras de negócio, estado, renderização, CSV e persistência local.
- `README.md` — documentação do projeto.

## Estrutura do CSV (colunas e ordem)
O CSV deve usar **exatamente** este cabeçalho (mesma ordem):

```csv
occurrenceId,personId,personName,date,durationMinutes,createdAt,updatedAt
```

### Descrição das colunas
1. `occurrenceId`: identificador único da ocorrência.
2. `personId`: identificador da pessoa (ex.: `P0001`).
3. `personName`: nome exibido da pessoa.
4. `date`: data da ocorrência (formato `YYYY-MM-DD`).
5. `durationMinutes`: duração persistida em **minutos inteiros**.
6. `createdAt`: timestamp ISO de criação.
7. `updatedAt`: timestamp ISO da última atualização.

## Regras de normalização (nome case-insensitive)
Para identificar se uma pessoa já existe, o nome é normalizado com as seguintes regras:
- `trim` (remove espaços nas extremidades)
- conversão para minúsculas
- remoção de acentos/diacríticos
- colapso de espaços múltiplos para espaço único

Exemplos equivalentes:
- `"João Silva"`, `"joao silva"`, `"JOÃO   SILVA"` → mesma pessoa

## Exemplos de entrada de duração e persistência esperada (minutos)
Entradas aceitas e valor salvo em `durationMinutes`:

- `90` → `90`
- `1:30` → `90`
- `01:05` → `65`
- `2h` → `120`
- `2h 15m` → `135`
- `0:45` → `45`

Validações importantes:
- `0` ou `0h 0m` → inválido (duração deve ser maior que zero)
- `1:75` → inválido (minutos em `h:mm` devem ser `00..59`)
- formato inválido (ex.: `abc`) → erro orientando formatos aceitos (`90`, `1:30`, `1h 30m`)

## Limitações
- Sem backend: todo processamento é no cliente.
- Persistência principal depende de recursos do navegador.
- A conexão direta com arquivo requer suporte à **File System Access API**.
- Em navegadores sem suporte, é necessário usar import/export manual.

## Melhorias futuras
- Testes automatizados (unitários para parser/normalização e integração de fluxo CSV).
- Suporte a mais formatos de importação (ex.: JSON).
- Histórico de auditoria de alterações.
- Indicadores e gráficos adicionais.
- PWA/offline aprimorado.

## Licença MIT
Este projeto está licenciado sob a licença **MIT**.
