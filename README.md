# Diagrams

このフォルダには設計図（Mermaidソース）を保存しています。

ファイル:
- `screen-flow.mmd`: 投稿サイトの画面フロー図（Mermaid）

SVGを生成するにはローカルで mermaid CLI を使います。Node.jsがインストールされている環境で次のコマンドを実行してください:

```pwsh
npx -y @mermaid-js/mermaid-cli -i public/diagrams/screen-flow.mmd -o public/diagrams/screen-flow.svg
```

VSCode拡張 `vstirbu.vscode-mermaid-preview` やオンラインの Mermaid Live Editor でもプレビューできます。
