-- Allow all calculation modes currently supported by the RAB volume backup UI.
-- Existing modes are retained; this only extends the accepted values.
ALTER TABLE public.volume_details
  DROP CONSTRAINT IF EXISTS volume_details_calc_mode_check;

ALTER TABLE public.volume_details
  ADD CONSTRAINT volume_details_calc_mode_check
  CHECK (
    calc_mode::text = ANY (
      ARRAY[
        'standard',
        'wall_area',
        'frame_length',
        'glass_area',
        'opening_count',
        'trapezoid',
        'rebar',
        'rebar_structure',
        'custom_formula',
        'custom_builder'
      ]::text[]
    )
  );
