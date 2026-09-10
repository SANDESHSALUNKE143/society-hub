import { ShField } from "@society-hub/ui";

type Props = {
  testIdPrefix: string;
  adultCount: string;
  childCount: string;
  seniorCitizenCount: string;
  onAdultsChange: (value: string) => void;
  onChildrenChange: (value: string) => void;
  onSeniorsChange: (value: string) => void;
};

export function HouseholdAgeCounts({
  testIdPrefix,
  adultCount,
  childCount,
  seniorCitizenCount,
  onAdultsChange,
  onChildrenChange,
  onSeniorsChange,
}: Props) {
  return (
    <fieldset className="sh-span-2">
      <legend className="label mb-1">Family members in this flat</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        <ShField label="Adults" htmlFor={`${testIdPrefix}-adults`}>
          <input
            id={`${testIdPrefix}-adults`}
            data-testid={`${testIdPrefix}-adults`}
            className="input"
            type="number"
            min={0}
            max={50}
            value={adultCount}
            onChange={(e) => onAdultsChange(e.target.value)}
          />
        </ShField>
        <ShField label="Children" htmlFor={`${testIdPrefix}-children`}>
          <input
            id={`${testIdPrefix}-children`}
            data-testid={`${testIdPrefix}-children`}
            className="input"
            type="number"
            min={0}
            max={50}
            value={childCount}
            onChange={(e) => onChildrenChange(e.target.value)}
          />
        </ShField>
        <ShField label="Senior citizens" htmlFor={`${testIdPrefix}-seniors`}>
          <input
            id={`${testIdPrefix}-seniors`}
            data-testid={`${testIdPrefix}-seniors`}
            className="input"
            type="number"
            min={0}
            max={50}
            value={seniorCitizenCount}
            onChange={(e) => onSeniorsChange(e.target.value)}
          />
        </ShField>
      </div>
    </fieldset>
  );
}
