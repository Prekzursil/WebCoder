// Module augmentation: register the shared type-ramp variants [SPEC-GAPS A12]
// on MUI's Typography so theme.typography.pageTitle & friends type-check.
// The side-effect import below makes this file an external module — required
// for `declare module` to AUGMENT the existing types instead of shadowing
// them.
import '@mui/material/styles';

declare module '@mui/material/styles' {
  interface TypographyVariants {
    pageTitle: {
      fontSize: string;
      fontWeight: number;
      letterSpacing: string;
    } & React.CSSProperties;
    sectionLabel: {
      fontSize: string;
      fontWeight: number;
      textTransform: 'uppercase';
      letterSpacing: string;
    } & React.CSSProperties;
    microLabel: {
      fontSize: string;
      fontWeight: number;
      textTransform: 'uppercase';
      letterSpacing: string;
    } & React.CSSProperties;
  }

  interface TypographyVariantsOptions {
    pageTitle?: TypographyVariants['pageTitle'];
    sectionLabel?: TypographyVariants['sectionLabel'];
    microLabel?: TypographyVariants['microLabel'];
  }
}

// Allow the variants on <Typography variant="pageTitle"> as well.
declare module '@mui/material/Typography/Typography' {
  interface TypographyPropsVariantOverrides {
    pageTitle: true;
    sectionLabel: true;
    microLabel: true;
  }
}
