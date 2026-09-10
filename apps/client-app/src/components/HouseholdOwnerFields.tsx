import { ShField } from "@society-hub/ui";

type Props = {
  testIdPrefix: string;
  mode: "edit" | "readonly";
  hasOwner?: boolean;
  name: string;
  phone: string;
  email: string;
  emergencyContact: string;
  emergencyTestId?: string;
  onNameChange?: (value: string) => void;
  onPhoneChange?: (value: string) => void;
  onEmailChange?: (value: string) => void;
  onEmergencyChange: (value: string) => void;
};

export function HouseholdOwnerFields({
  testIdPrefix,
  mode,
  hasOwner = false,
  name,
  phone,
  email,
  emergencyContact,
  emergencyTestId,
  onNameChange,
  onPhoneChange,
  onEmailChange,
  onEmergencyChange,
}: Props) {
  const readOnly = mode === "readonly";
  const hint =
    mode === "readonly"
      ? "Owner of this flat. Emergency contact can be updated here."
      : hasOwner
        ? "Update the owner’s name, mobile, or email. A flat still has only one owner."
        : "Name and mobile for the owner. They can add family later.";

  return (
    <>
      <p className="sh-span-2 text-xs text-black/50">{hint}</p>
      <ShField label="Owner name" htmlFor={`${testIdPrefix}-name`}>
        <input
          id={`${testIdPrefix}-name`}
          data-testid={`${testIdPrefix}-name`}
          className={readOnly ? "input bg-[var(--mist)]/50" : "input"}
          value={name}
          readOnly={readOnly}
          disabled={readOnly}
          required={!readOnly}
          onChange={onNameChange ? (e) => onNameChange(e.target.value) : undefined}
        />
      </ShField>
      <ShField label="Contact number" htmlFor={`${testIdPrefix}-phone`}>
        <input
          id={`${testIdPrefix}-phone`}
          data-testid={`${testIdPrefix}-phone`}
          className={readOnly ? "input bg-[var(--mist)]/50" : "input"}
          value={phone}
          readOnly={readOnly}
          disabled={readOnly}
          required={!readOnly}
          onChange={onPhoneChange ? (e) => onPhoneChange(e.target.value) : undefined}
        />
      </ShField>
      <ShField label="Email" htmlFor={`${testIdPrefix}-email`} className="sh-span-2">
        <input
          id={`${testIdPrefix}-email`}
          data-testid={`${testIdPrefix}-email`}
          className={readOnly ? "input bg-[var(--mist)]/50" : "input"}
          type="email"
          value={email}
          readOnly={readOnly}
          disabled={readOnly}
          onChange={onEmailChange ? (e) => onEmailChange(e.target.value) : undefined}
        />
      </ShField>
      <ShField
        label="Emergency contact"
        htmlFor={emergencyTestId ?? `${testIdPrefix}-emergency-contact`}
      >
        <input
          id={emergencyTestId ?? `${testIdPrefix}-emergency-contact`}
          data-testid={emergencyTestId ?? `${testIdPrefix}-emergency-contact`}
          className="input"
          placeholder="Name & phone"
          value={emergencyContact}
          onChange={(e) => onEmergencyChange(e.target.value)}
        />
      </ShField>
    </>
  );
}
