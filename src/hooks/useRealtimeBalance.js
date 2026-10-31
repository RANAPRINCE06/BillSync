import { useState, useEffect } from 'react';
import { firestoreFinanceService } from '../services/firestoreFinanceService';
import { formatINR } from '../utils/balanceEngine';

export function useRealtimeBalance() {
  const [balanceData, setBalanceData] = useState(() => firestoreFinanceService.getCurrentBalance());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const unsubscribe = firestoreFinanceService.subscribe((data) => {
      setBalanceData(data);
      setLoading(false);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  return {
    ...balanceData,
    loading,
    formatINR,
  };
}

