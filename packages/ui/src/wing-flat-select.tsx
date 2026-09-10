import { ShField } from "./layout";
import {
  firstFlatIdInWing,
  flatsInWing,
  uniqueWingNames,
  wingForFlatId,
  wingLabel,
  type WingFlatRow,
} from "./flat-picker";

export function WingFlatSelect({
  flats,
  value,
  onChange,
  required = true,
  wingLabel: wingFieldLabel = "Wing",
  flatLabel = "Flat",
  wingHtmlFor = "wing",
  flatHtmlFor = "flat",
  wingTestId,
  flatTestId,
}: {
  flats: WingFlatRow[];
  value: string;
  onChange: (flatId: string) => void;
  required?: boolean;
  wingLabel?: string;
  flatLabel?: string;
  wingHtmlFor?: string;
  flatHtmlFor?: string;
  wingTestId?: string;
  flatTestId?: string;
}) {
  const wings = uniqueWingNames(flats);
  const wing = wingForFlatId(flats, value);
  const options = flatsInWing(flats, wing);

  return (
    <div className="contents">
      <ShField label={wingFieldLabel} htmlFor={wingHtmlFor}>
        <select
          id={wingHtmlFor}
          className="input"
          data-testid={wingTestId}
          value={wing}
          disabled={wings.length === 0}
          onChange={(e) => onChange(firstFlatIdInWing(flats, e.target.value))}
        >
          {wings.length === 0 && <option value="">No wings yet</option>}
          {wings.map((name) => (
            <option key={name || "none"} value={name}>
              {wingLabel(name)}
            </option>
          ))}
        </select>
      </ShField>
      <ShField label={flatLabel} htmlFor={flatHtmlFor}>
        <select
          id={flatHtmlFor}
          className="input"
          data-testid={flatTestId}
          value={value}
          required={required}
          disabled={options.length === 0}
          onChange={(e) => onChange(e.target.value)}
        >
          {options.length === 0 && <option value="">No flats in this wing</option>}
          {options.map((flat) => (
            <option key={flat.id} value={flat.id}>
              {flat.number}
            </option>
          ))}
        </select>
      </ShField>
    </div>
  );
}
