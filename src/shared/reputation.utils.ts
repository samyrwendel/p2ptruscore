/**
 * Utilitários para cálculo de reputação e níveis de confiança
 * Centraliza a lógica de níveis para evitar duplicação de código
 */

export interface ReputationInfo {
  nivel: string;
  icone: string;
  score: number;
}

/**
 * Calcula o nível de reputação baseado na pontuação
 * @param karma Objeto karma ou pontuação direta
 * @returns Informações de reputação (nível, ícone, score)
 */
export function getReputationInfo(karma: any): ReputationInfo {
  const score = typeof karma === 'number' ? karma : (karma?.karma || 0);
  let nivel = 'Iniciante';
  let icone = '🔰';
  
  if (score < 0) {
    nivel = 'Problemático';
    icone = '🔴';
  } else if (score < 50) {
    nivel = 'Iniciante';
    icone = '🔰';
  } else if (score < 100) {
    nivel = 'Bronze';
    icone = '🥉';
  } else if (score < 200) {
    nivel = 'Prata';
    icone = '🥈';
  } else if (score < 500) {
    nivel = 'Ouro';
    icone = '🥇';
  } else {
    nivel = 'Mestre P2P';
    icone = '🏆';
  }
  
  return { nivel, icone, score };
}

/**
 * Calcula o nível de reputação com emojis alternativos (para compatibilidade)
 * @param karma Objeto karma ou pontuação direta
 * @returns Informações de reputação com emojis alternativos
 */
export function getReputationInfoAlt(karma: any): { nivel: string; emoji: string; score: number } {
  const score = typeof karma === 'number' ? karma : (karma?.karma || 0);
  let nivel = 'Iniciante';
  let emoji = '▼';
  
  if (score < 0) {
    nivel = 'Problemático';
    emoji = '🔴';
  } else if (score < 50) {
    nivel = 'Iniciante';
    emoji = '▼';
  } else if (score >= 50) {
    nivel = 'Experiente';
    emoji = '▲';
  }
  
  if (score >= 100) {
    nivel = 'Veterano';
    emoji = '■';
  }
  
  if (score >= 200) {
    nivel = 'Especialista';
    emoji = '♦';
  }
  
  if (score >= 500) {
    nivel = 'Mestre P2P';
    emoji = '●';
  }
  
  return { nivel, emoji, score };
}

/**
 * Calcula o nível de reputação com emojis coloridos (para hello/bora handlers)
 * @param karma Objeto karma ou pontuação direta
 * @returns Informações de reputação com emojis coloridos
 */
export function getReputationInfoColored(karma: any): { nivel: string; emoji: string; score: number } {
  const score = typeof karma === 'number' ? karma : (karma?.karma || 0);
  let nivel = 'Iniciante';
  let emoji = '🔴';
  
  if (score < 50) {
    nivel = 'Iniciante';
    emoji = '🔴';
  } else if (score >= 50) {
    nivel = 'Experiente';
    emoji = '🟡';
  }
  
  if (score >= 100) {
    nivel = 'Veterano';
    emoji = '🟢';
  }
  
  if (score >= 200) {
    nivel = 'Especialista';
    emoji = '🟢';
  }
  
  if (score >= 500) {
    nivel = 'Mestre P2P';
    emoji = '💎';
  }
  
  return { nivel, emoji, score };
}