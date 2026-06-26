const fs = require('fs');

function processFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');

  // Remove dark classes
  content = content.replace(/(['"\s])[a-z0-9:]*dark:[a-z0-9\-\.\/]+/gi, '$1');
  
  // Clean up possible trailing spaces before quotes due to removal
  content = content.replace(/ +(["'])/g, '$1');
  content = content.replace(/(["']) +/g, '$1');

  // specific overrides first
  content = content.replace(/hover:bg-brand-orange\/90/g, 'hover:bg-brand-cta-hover');
  
  // then global overrides
  content = content.replace(/brand-orange/g, 'brand-cta');
  content = content.replace(/bg-gray-50/g, 'bg-brand-bg');
  content = content.replace(/border-gray-200/g, 'border-brand-seashell');
  content = content.replace(/border-gray-150/g, 'border-brand-seashell');
  content = content.replace(/text-gray-500/g, 'text-brand-pale');

  fs.writeFileSync(filePath, content, 'utf8');
}

processFile('c:/Users/Usr/Documents/Desarrollo/gruasBacar/frontend/src/pages/HistorialPage.tsx');
processFile('c:/Users/Usr/Documents/Desarrollo/gruasBacar/frontend/src/pages/AdminPage.tsx');

console.log('Replacement done successfully.');
