/**
 * Configurações centralizadas para sistema de karma
 * Centraliza todos os valores para evitar hardcoding
 */

export interface KarmaConfig {
  // Conversão de estrelas para pontos
  starConversion: {
    [key: number]: number;
  };
  
  // Penalidades administrativas
  penalties: {
    warning: number;
    kick: number;
    ban: number;
  };
  
  // Níveis de reputação
  reputationLevels: {
    problematic: { min: number; max: number };
    beginner: { min: number; max: number };
    bronze: { min: number; max: number };
    silver: { min: number; max: number };
    gold: { min: number; max: number };
    master: { min: number; max: number };
  };
  
  // Limites do sistema
  limits: {
    maxDailyEvaluations: number;
    maxTransferAmount: number;
    cooldownHours: number;
  };
}

/**
 * Configuração padrão do sistema de karma
 * Todos os valores hardcoded devem ser movidos para cá
 */
export const KARMA_CONFIG: KarmaConfig = {
  // Conversão de estrelas para pontos de karma
  starConversion: {
    5: 5,   // 5 estrelas = +5 pontos
    4: 2,   // 4 estrelas = +2 pontos
    3: 0,   // 3 estrelas = neutro
    2: -2,  // 2 estrelas = -2 pontos
    1: -5,  // 1 estrela = -5 pontos
  },
  
  // Penalidades administrativas
  penalties: {
    warning: -10,  // Advertência remove 10 pontos
    kick: -25,     // Kick remove 25 pontos
    ban: -50,      // Ban remove 50 pontos
  },
  
  // Níveis de reputação baseados na pontuação
  reputationLevels: {
    problematic: { min: -Infinity, max: -1 },
    beginner: { min: 0, max: 49 },
    bronze: { min: 50, max: 99 },
    silver: { min: 100, max: 199 },
    gold: { min: 200, max: 499 },
    master: { min: 500, max: Infinity },
  },
  
  // Limites do sistema
  limits: {
    maxDailyEvaluations: 10,
    maxTransferAmount: 50,
    cooldownHours: 1,
  },
};

/**
 * Converte estrelas para pontos de karma usando configuração
 */
export function convertStarsToKarma(stars: number): number {
  return KARMA_CONFIG.starConversion[stars] || 0;
}

/**
 * Obtém penalidade administrativa
 */
export function getAdminPenalty(type: 'warning' | 'kick' | 'ban'): number {
  return KARMA_CONFIG.penalties[type];
}

/**
 * Determina nível de reputação baseado na pontuação
 */
export function getReputationLevel(score: number): string {
  const levels = KARMA_CONFIG.reputationLevels;
  
  if (score >= levels.master.min) return 'master';
  if (score >= levels.gold.min) return 'gold';
  if (score >= levels.silver.min) return 'silver';
  if (score >= levels.bronze.min) return 'bronze';
  if (score >= levels.beginner.min) return 'beginner';
  return 'problematic';
}

/**
 * Obtém informações completas do nível de reputação
 */
export function getReputationInfo(score: number): {
  level: string;
  icon: string;
  name: string;
} {
  const level = getReputationLevel(score);
  
  const levelInfo = {
    problematic: { icon: '🔴', name: 'Problemático' },
    beginner: { icon: '🔰', name: 'Iniciante' },
    bronze: { icon: '🥉', name: 'Bronze' },
    silver: { icon: '🥈', name: 'Prata' },
    gold: { icon: '🥇', name: 'Ouro' },
    master: { icon: '🏆', name: 'Mestre P2P' },
  };
  
  return {
    level,
    icon: levelInfo[level].icon,
    name: levelInfo[level].name,
  };
}