const fs = require('fs');
const path = require('path');

const files = [
  'AdminSidebar.tsx',
  'AdminListFilters.tsx',
  'AdminDuplasPanel.tsx',
  'AdminUsuariosPanel.tsx'
];

const dir = 'c:\\Users\\Usr\\Documents\\Desarrollo\\gruasBacar\\frontend\\src\\components\\admin';

files.forEach(f => {
  const p = path.join(dir, f);
  let content = fs.readFileSync(p, 'utf8');

  // 1. Remove all `dark:` class prefixes completely
  content = content.replace(/dark:[^\s"']+/g, '');
  // Clean up extra spaces inside classNames
  content = content.replace(/\s+(?=["'])/g, ''); // Space before end of string/class
  content = content.replace(/ +/g, ' '); // Collapse multiple spaces

  // Replace any standalone bg-zinc-900 or bg-zinc-950 just in case
  // The prompt says "Replace any bg-zinc-900 or bg-zinc-950 with bg-white if it's a card/panel, or bg-brand-bg if it's an input/search bar"
  // Since we already removed dark:bg-zinc-..., there shouldn't be any left, but let's be safe.
  // We'll replace brand-orange first
  
  // 2. Replace brand-orange with brand-cta everywhere
  content = content.replace(/brand-orange/g, 'brand-cta');

  // 3. Replace bg-gray-50 with bg-brand-bg
  content = content.replace(/bg-gray-50/g, 'bg-brand-bg');

  // 4. Replace border-gray-250, border-gray-150 and border-gray-200 with border-brand-seashell
  content = content.replace(/border-gray-250/g, 'border-brand-seashell');
  content = content.replace(/border-gray-150/g, 'border-brand-seashell');
  content = content.replace(/border-gray-200/g, 'border-brand-seashell');

  // 5. Replace text-gray-400 and text-gray-500 with text-brand-pale
  content = content.replace(/text-gray-400/g, 'text-brand-pale');
  content = content.replace(/text-gray-500/g, 'text-brand-pale');

  // 6. Replace text-gray-800 and text-gray-700 with text-brand-purply
  content = content.replace(/text-gray-800/g, 'text-brand-purply');
  content = content.replace(/text-gray-700/g, 'text-brand-purply');

  // 7. Replace hover:border-gray-300 with hover:border-brand-pale/50
  content = content.replace(/hover:border-gray-300/g, 'hover:border-brand-pale/50');

  // 8. Replace hover:bg-gray-50 with hover:bg-brand-bg
  // Wait, step 3 already replaced bg-gray-50 with bg-brand-bg! 
  // So hover:bg-gray-50 would have become hover:bg-brand-bg already. This is perfectly fine.

  // 9. bg-zinc-900 and bg-zinc-950
  // "Replace any bg-zinc-900 or bg-zinc-950 with bg-white if it's a card/panel, or bg-brand-bg if it's an input/search bar."
  // If there are any remaining, let's just do a manual replace if they exist, but they were all `dark:`. 

  fs.writeFileSync(p, content);
});
console.log('Done');
