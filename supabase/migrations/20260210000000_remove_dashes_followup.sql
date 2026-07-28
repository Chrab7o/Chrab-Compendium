-- Follow-up to 20260209000000: Major Premonitions was missed in that pass.
update homebrew_class_features set description = replace(
  description,
  'Before rolling your damage, predict your damage roll - if correct, you deal an additional 3d4 psychic damage.',
  'Before rolling your damage, predict your damage roll; if correct, you deal an additional 3d4 psychic damage.'
) where id = 'bfa2c37b-99b1-4d2c-8803-ff72f475d982';
