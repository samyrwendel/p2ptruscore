const fs = require('fs');
const path = require('path');

// Função para copiar diretório recursivamente
function copyDir(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  
  const entries = fs.readdirSync(src, { withFileTypes: true });
  
  for (let entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Copiar pasta views
const srcViews = path.join(__dirname, 'src', 'views');
const destViews = path.join(__dirname, 'dist', 'src', 'views');

if (fs.existsSync(srcViews)) {
  console.log('📁 Copiando pasta views...');
  copyDir(srcViews, destViews);
  console.log('✅ Pasta views copiada com sucesso!');
} else {
  console.log('❌ Pasta src/views não encontrada');
}