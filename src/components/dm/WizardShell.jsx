// Generic multi-step form shell for the homebrew builder. Every step pill is
// always clickable — nothing writes to the DB until the final Save, so
// jumping back to fix an earlier step (or ahead to preview later ones) is
// always safe. Owns only which step is showing; all domain state lives in
// the caller, same separation SkillTreeNodeEditor keeps between its own
// `form` state and the presentational SkillTreeDiagram.
export default function WizardShell({
  steps,
  currentStep,
  onStepChange,
  onSave,
  onCancel,
  saving,
  error,
  saveLabel = 'Save',
  children,
}) {
  const currentIndex = steps.findIndex((s) => s.key === currentStep)
  const isLastStep = currentIndex === steps.length - 1

  return (
    <div className="wizard-shell">
      <div className="wizard-steps">
        {steps.map((step, i) => (
          <button
            key={step.key}
            type="button"
            className={`wizard-step${step.key === currentStep ? ' active' : ''}`}
            onClick={() => onStepChange(step.key)}
          >
            {i + 1}. {step.label}
          </button>
        ))}
      </div>

      <div className="wizard-step-content">{children}</div>

      {error && <p className="status-message error">{error}</p>}

      <div className="dm-form-actions">
        {onCancel && (
          <button type="button" className="secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
        {currentIndex > 0 && (
          <button type="button" className="secondary" onClick={() => onStepChange(steps[currentIndex - 1].key)}>
            Back
          </button>
        )}
        {isLastStep ? (
          <button type="button" onClick={onSave} disabled={saving}>
            {saving ? 'Saving...' : saveLabel}
          </button>
        ) : (
          <button type="button" onClick={() => onStepChange(steps[currentIndex + 1].key)}>
            Next
          </button>
        )}
      </div>
    </div>
  )
}
