type KarmaHistoryEntry = {
  timestamp: Date;
  karmaChange: number;
  comment?: string;
  evaluatorName?: string;
};

type UserLike = {
  firstName: string;
  lastName?: string;
  userName?: string;
};

export const formatKarmaHistory = (
  history: KarmaHistoryEntry[] | undefined,
): string => {
  if (!history || history.length === 0) {
    return 'Nenhum histórico de score encontrado.';
  }

  return history
    .slice(-10)
    .map((entry) => {
      const sign = entry.karmaChange > 0 ? '+' : '';
      const dateString = new Date(entry.timestamp).toLocaleString('pt-BR');
      let result = `${dateString}: ${sign}${entry.karmaChange}`;
      
      if (entry.evaluatorName) {
        result += ` (por ${entry.evaluatorName})`;
      }
      
      if (entry.comment) {
        result += `\n   💬 "${entry.comment}"`;
      }
      
      return result;
    })
    .join('\n\n');
};

export const formatUsernameForDisplay = (user: UserLike): string => {
  if (user.firstName && user.lastName) {
    return `${user.firstName} ${user.lastName}`;
  }

  if (user.firstName) {
    return user.firstName;
  }

  if (user.userName) {
    return user.userName;
  }

  return 'Usuário desconhecido';
};
