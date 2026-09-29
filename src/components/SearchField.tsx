import { TextField, InputAdornment } from '@wso2/oxygen-ui';
import { Search } from '@wso2/oxygen-ui-icons-react';

type SearchFieldProps = {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  size?: 'small' | 'medium';
  fullWidth?: boolean;
  sx?: object;
};

export default function SearchField({ value, onChange, placeholder = 'Search...', size = 'small', fullWidth, sx }: SearchFieldProps) {
  return (
    <TextField
      fullWidth={fullWidth}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      size={size}
      sx={sx}
      slotProps={{
        htmlInput: { 'aria-label': placeholder },
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <Search size={size === 'small' ? 18 : 20} />
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
