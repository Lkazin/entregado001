const fs = require('fs');
const path = require('path');

const migrations = [
  '20261029000001_core_schema.sql',
  '20261029000002_logistics_schema.sql',
  '20261029000003_rls_and_security.sql',
  '20261029000004_seed_data.sql'
];

let fullSql = `-- ====================================================================
-- SCRIPT CONSOLIDADO COMPLETO: Pizzaria de Testes NovaesWeb
-- Executável diretamente no SQL Editor do Supabase Dashboard
-- Data de geração: ${new Date().toISOString()}
-- ====================================================================

`;

for (const m of migrations) {
  const filePath = path.join(__dirname, 'migrations', m);
  const content = fs.readFileSync(filePath, 'utf-8');
  fullSql += `\n-- >>> INÍCIO: ${m} <<<\n\n` + content + `\n\n-- >>> FIM: ${m} <<<\n\n`;
}

fs.writeFileSync(path.join(__dirname, 'complete_setup.sql'), fullSql, 'utf-8');
console.log('complete_setup.sql generated successfully! Total size:', fullSql.length, 'bytes');
