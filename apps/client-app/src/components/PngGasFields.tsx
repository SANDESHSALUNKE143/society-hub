type Props = {
  name: string;
  testIdPrefix: string;
  value: boolean;
  onChange: (taken: boolean) => void;
};

export function PngGasFields({ name, testIdPrefix, value, onChange }: Props) {
  return (
    <fieldset className="sh-span-2">
      <legend className="label mb-1">PNG gas connection</legend>
      <div className="flex gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={name}
            data-testid={`${testIdPrefix}-png-yes`}
            checked={value}
            onChange={() => onChange(true)}
          />
          Taken
        </label>
        <label className="flex items-center gap-2">
          <input
            type="radio"
            name={name}
            data-testid={`${testIdPrefix}-png-no`}
            checked={!value}
            onChange={() => onChange(false)}
          />
          Not taken
        </label>
      </div>
    </fieldset>
  );
}
