import { Search } from 'lucide-react';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export function SearchBar({ value, onChange, placeholder = 'Search APIs…', className }: SearchBarProps) {
  return (
    <div className={['relative flex items-center', className ?? ''].join(' ')}>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label="Search"
        className="w-full bg-[#121212] text-[#E2E8F0] placeholder:text-[#8F909E] outline-none"
        style={{
          height: '40px',
          border: '1px solid #262626',
          borderRadius: '0px',
          paddingLeft: '16px',
          paddingRight: '40px',
          fontSize: '13px',
          lineHeight: '20px',
          fontWeight: 400,
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = '#8B5CF6';
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = '#262626';
        }}
      />
      <Search
        size={16}
        className="pointer-events-none absolute right-3 text-[#8F909E]"
        style={{ right: '12px' }}
        aria-hidden
      />
    </div>
  );
}
