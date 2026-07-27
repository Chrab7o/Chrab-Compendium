-- Subclass features can have the same "pick one of these" shape class
-- features can (choice_group/choice_count were only added to
-- homebrew_class_features before) - kept consistent since nothing about the
-- concept is class-specific.
alter table homebrew_subclass_features add column if not exists choice_group text not null default '';
alter table homebrew_subclass_features add column if not exists choice_count integer;
