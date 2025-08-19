hexo.extend.filter.register('after_render:html', function(str) {
  // 只處理包含 mermaid 語法的頁面
  if (!str.includes('sequenceDiagram') && !str.includes('graph TB') && !str.includes('mermaid')) {
    return str;
  }

  const mermaidCDN = '<script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>';

  const initScript = `
<script>
  document.addEventListener("DOMContentLoaded", function() {
    // Mermaid 初始化設定
    mermaid.initialize({
      startOnLoad: false, // 我們會手動渲染
      theme: "default"
    });

    // 找出所有由 Hexo 產生的 Mermaid 程式碼區塊
    // 通常會是 <figure class="highlight plaintext"> 或 <figure class="highlight mermaid">
    const figures = document.querySelectorAll("figure.highlight.plaintext, figure.highlight.mermaid");

    figures.forEach((figure, index) => {
      // 程式碼通常在一個包含行號的表格中
      const codeContainer = figure.querySelector('td.code pre');
      if (!codeContainer) {
        return; // 如果結構不符就跳過
      }

      let mermaidCode = codeContainer.innerText;

      // 確認這真的是一個 Mermaid 區塊
      if (mermaidCode.trim().startsWith('sequenceDiagram') || mermaidCode.trim().startsWith('graph')) {
        const container = document.createElement('div');
        container.className = 'mermaid';
        container.id = 'mermaid-diagram-' + index;
        container.style.textAlign = 'center'; // 置中圖表
        container.textContent = mermaidCode;

        // 將原本的 <figure> 替換成我們的新容器
        figure.parentNode.replaceChild(container, figure);
      }
    });

    // 渲染所有我們剛剛建立的 .mermaid 容器
    const mermaidElements = document.querySelectorAll('.mermaid');
    if (mermaidElements.length > 0) {
      console.log('Rendering ' + mermaidElements.length + ' Mermaid diagram(s).');
      // 使用 mermaid.run() 來渲染動態加入的元素
      mermaid.run({
          nodes: mermaidElements
      });
    }
  });
</script>
  `;

  // 將 CDN 和初始化腳本注入到 </body> 標籤前
  return str.replace('</body>', mermaidCDN + initScript + '</body>');
});
