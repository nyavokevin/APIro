import { Dices } from 'lucide-react';
import { useState } from 'react';

import { api } from '../../services/api';
import { Button } from '../ui/Button';

interface SeedButtonProps {
  fieldName: string;
  onGenerate: (value: string) => void;
  title?: string;
}

export function SeedButton({ fieldName, onGenerate, title }: SeedButtonProps) {
  const [loading, setLoading] = useState(false);

  const handle = async () => {
    setLoading(true);
    try {
      const value = await api.seed.generate(fieldName);
      onGenerate(value);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={handle}
      disabled={loading || !fieldName.trim()}
      title={title ?? `Generate value for ${fieldName}`}
    >
      <Dices size={14} />
    </Button>
  );
}
