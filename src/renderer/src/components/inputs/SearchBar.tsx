import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({ value, onChange, placeholder = 'Search APIs…', className }: SearchBarProps) {
  return (
    <div className={['relative flex items-center group', className ?? ''].join(' ')}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        className="w-full bg-[#121215] text-[#E6E8F0] placeholder:text-[#5A5E6E] outline-none transition-all hover:border-[#2E2E36] focus:border-[#8B5CF6] focus:bg-[#0E0E10]"
        style={{
          height: '40px',
          border: '1px solid #232329',
          borderRadius: '0px',
          paddingLeft: '36px',
          paddingRight: '16px',
          fontSize: '13px',
          lineHeight: '20px',
          fontWeight: 440,
          letterSpacing: '-0.01em',
        }}
      />
      <Search
        size={15}
        className="pointer-events-none absolute left-3 text-[#7A7F93] group-focus-within:text-[#8B5CF6] transition-colors"
        aria-hidden
        strokeWidth={1.9}
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute right-2 flex h-6 w-6 items-center justify-center text-[#7A7F93] hover:text-[#E6E8F0] hover:bg-[#232329] active:scale-90 transition-all"
          aria-label="Clear search"
          style={{ borderRadius: '0px' }}
        >
          ×
        </button>
      )}
    </div>
  );
}
