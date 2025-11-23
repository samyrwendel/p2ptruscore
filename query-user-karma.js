// Consulta consolidada de karma para um usuário por @username ou nome
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

async function main() {
  const rawInput = process.argv[2] || '';
  const input = rawInput.startsWith('@') ? rawInput.slice(1) : rawInput;

  if (!input) {
    console.log('❌ Informe o usuário. Exemplo: node query-user-karma.js @samyralmeida');
    process.exit(1);
  }

  const uri = process.env.MONGODB_CNN;
  if (!uri) {
    console.error('❌ MONGODB_CNN não definido no .env');
    process.exit(1);
  }

  const client = new MongoClient(uri);
  try {
    console.log('🔗 Conectando ao MongoDB...');
    await client.connect();
    const db = client.db();
    const users = db.collection('users');
    const karmas = db.collection('karmas');

    // Encontrar usuário por userName ou firstName
    const user = await users.findOne({
      $or: [
        { userName: input },
        { firstName: input }
      ]
    });

    if (!user) {
      console.log(`❌ Usuário "${input}" não encontrado`);
      return;
    }

    console.log('👤 Usuário encontrado:', {
      userId: user.userId,
      userName: user.userName,
      firstName: user.firstName
    });

    // Buscar todos os documentos de karma do usuário
    const karmaDocs = await karmas.find({ user: new ObjectId(user._id) }).toArray();
    console.log(`📄 Documentos de karma: ${karmaDocs.length}`);

    if (karmaDocs.length === 0) {
      console.log('ℹ️ Sem registros de karma. Total consolidado = 0');
      return;
    }

    // Consolidação de totais
    const totals = karmaDocs.reduce((acc, doc) => {
      acc.totalKarma += (doc.karma || 0);
      acc.totalGiven += (doc.givenKarma || 0);
      acc.totalHate += (doc.givenHate || 0);
      acc.stars1 += (doc.stars1 || 0);
      acc.stars2 += (doc.stars2 || 0);
      acc.stars3 += (doc.stars3 || 0);
      acc.stars4 += (doc.stars4 || 0);
      acc.stars5 += (doc.stars5 || 0);
      return acc;
    }, { totalKarma: 0, totalGiven: 0, totalHate: 0, stars1: 0, stars2: 0, stars3: 0, stars4: 0, stars5: 0 });

    console.log('\n📊 Totais Consolidados:');
    console.log(`   ⭐ Total Karma: ${totals.totalKarma}`);
    console.log(`   👍 Positivas dadas: ${totals.totalGiven}`);
    console.log(`   👎 Negativas dadas: ${totals.totalHate}`);
    console.log(`   Contadores de estrelas: 1⭐=${totals.stars1}, 2⭐=${totals.stars2}, 3⭐=${totals.stars3}, 4⭐=${totals.stars4}, 5⭐=${totals.stars5}`);

    // Consolidar histórico
    const fullHistory = karmaDocs.flatMap(doc => (doc.history || []).map(h => ({
      ...h,
      group: doc.group,
    })));

    // Ordenar por timestamp se existir
    fullHistory.sort((a, b) => {
      const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return tb - ta;
    });

    // Detectar entradas administrativas/legacy
    const isAdministrative = (entry) => {
      const comment = (entry.comment || '').toLowerCase();
      const evaluator = (entry.evaluatorName || '').toLowerCase();
      const legacyBoost = !('starRating' in entry) && (entry.karmaChange || 0) >= 100; // ex.: 501
      return comment.includes('administrativo') || evaluator === 'sistema' || legacyBoost;
    };

    // Totais alternativos a partir do histórico
    const totalsFromHistory = fullHistory.reduce((acc, e) => {
      const change = e.karmaChange || 0;
      acc.all += change;
      if (!isAdministrative(e)) acc.withoutAdmin += change;
      return acc;
    }, { all: 0, withoutAdmin: 0 });

    console.log('\n🧮 Totais derivados do histórico:');
    console.log(`   Inclui tudo (soma histórico): ${totalsFromHistory.all}`);
    console.log(`   Sem administrativos/legacy: ${totalsFromHistory.withoutAdmin}`);
    console.log(`   Diferença (admin/legacy): ${totalsFromHistory.all - totalsFromHistory.withoutAdmin}`);

    console.log(`\n🧾 Histórico consolidado: ${fullHistory.length} entradas`);
    for (const entry of fullHistory.slice(0, 20)) {
      const ts = entry.timestamp ? new Date(entry.timestamp).toISOString() : 'sem timestamp';
      const sr = entry.starRating !== undefined ? `${entry.starRating}⭐` : 'legacy';
      const adminTag = isAdministrative(entry) ? ' [admin]' : '';
      console.log(`   • ${ts} | ${sr} | Δ=${entry.karmaChange || 0} | ${entry.comment || ''} | by=${entry.evaluatorName || ''}${adminTag}`);
    }

    console.log('\n✅ Consulta concluída.');
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

main();