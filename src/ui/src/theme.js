import { extendTheme } from "@chakra-ui/react";

// Brand green, re-tuned so the shade used for link text and solid buttons (500)
// clears WCAG AA against white: #23735E is 5.7:1 (the old #2F9176 was 3.9:1).
const brand = {
  50: "#E8F5F1",
  100: "#C5E7DC",
  200: "#93D2BF",
  300: "#5CB89C",
  400: "#2F9176", // original LBRY green: decorative use only, fails AA as text
  500: "#23735E", // links, solid buttons, logo
  600: "#1C5E4D", // hover
  700: "#154A3C", // active
  800: "#0E352B",
  900: "#07201A",
};

const theme = extendTheme({
  config: { initialColorMode: "system", useSystemColorMode: false },

  colors: { brand },

  fonts: {
    heading: '"Inter", -apple-system, system-ui, sans-serif',
    body: '"Inter", -apple-system, system-ui, sans-serif',
    mono: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
  },

  // Every colour the UI uses goes through these, so light and dark both meet AA.
  semanticTokens: {
    colors: {
      "bg.canvas": { default: "white", _dark: "gray.900" },
      "bg.surface": { default: "white", _dark: "gray.800" },
      "bg.chip": { default: "gray.100", _dark: "gray.700" },
      "bg.banner": { default: "brand.50", _dark: "gray.800" },
      "border.default": { default: "gray.200", _dark: "gray.700" },
      "fg.default": { default: "gray.800", _dark: "gray.100" },
      "fg.muted": { default: "gray.600", _dark: "gray.300" }, // 7.5:1 on white, 11:1 on gray.800
      "accent.fg": { default: "brand.500", _dark: "brand.200" },
      "accent.fgHover": { default: "brand.600", _dark: "brand.100" },
      "accent.solid": { default: "brand.500", _dark: "brand.500" },
      "accent.solidHover": { default: "brand.600", _dark: "brand.600" },
      "accent.solidActive": { default: "brand.700", _dark: "brand.700" },
      "accent.subtle": { default: "brand.50", _dark: "whiteAlpha.100" },
      "focus.ring": { default: "blue.600", _dark: "blue.300" },
    },
  },

  // Two-tone focus ring: visible on white, on the canvas and on solid green buttons.
  shadows: {
    outline: "0 0 0 2px var(--chakra-colors-bg-canvas), 0 0 0 4px var(--chakra-colors-focus-ring)",
  },

  // One radius for containers (lg, 8px), one for controls and chips (md, 6px).
  layerStyles: {
    card: { bg: "bg.surface", borderWidth: "1px", borderColor: "border.default", borderRadius: "lg" },
    chip: { bg: "bg.chip", color: "fg.default", borderRadius: "md" },
    banner: { bg: "bg.banner", borderWidth: "1px", borderColor: "border.default", borderRadius: "lg" },
  },

  textStyles: {
    helper: { fontSize: "sm", color: "fg.muted" },
    lead: { fontSize: "lg", color: "fg.muted" },
  },

  styles: {
    global: {
      body: { bg: "bg.canvas", color: "fg.default" },
    },
  },

  components: {
    Button: {
      baseStyle: { fontWeight: "semibold", borderRadius: "md" },
      // Two heights only: md (40px) for primary actions, sm (32px) for everything else.
      sizes: {
        xs: { h: 8, minW: 8, fontSize: "sm", px: 3 },
        lg: { h: 10, minW: 10, fontSize: "md", px: 4 },
      },
      variants: {
        // Hover and active go darker, never lighter.
        solid: {
          bg: "accent.solid",
          color: "white",
          _hover: { bg: "accent.solidHover", _disabled: { bg: "accent.solid" } },
          _active: { bg: "accent.solidActive" },
        },
        outline: {
          bg: "transparent",
          borderWidth: "1px",
          borderColor: "accent.fg",
          color: "accent.fg",
          _hover: { bg: "accent.subtle" },
          _active: { bg: "accent.subtle" },
        },
        ghost: {
          color: "accent.fg",
          _hover: { bg: "accent.subtle" },
          _active: { bg: "accent.subtle" },
        },
      },
      // Secondary by default; the one primary action per view opts into solid/md.
      defaultProps: { variant: "outline", size: "sm" },
    },
    Link: {
      baseStyle: {
        color: "accent.fg",
        _hover: { color: "accent.fgHover", textDecoration: "underline" },
      },
      variants: {
        nav: {
          color: "fg.muted",
          fontSize: "sm",
          fontWeight: "medium",
          textUnderlineOffset: "6px",
          _hover: { color: "fg.default", textDecoration: "none" },
          "&[aria-current=page]": {
            color: "fg.default",
            fontWeight: "semibold",
            textDecoration: "underline",
            textDecorationThickness: "2px",
            textDecorationColor: "accent.fg",
          },
        },
      },
    },
    Heading: { baseStyle: { color: "fg.default" } },
    Code: { baseStyle: { borderRadius: "md" } },
    Badge: { baseStyle: { borderRadius: "md", px: 2 } },
    Alert: { baseStyle: { container: { borderRadius: "lg" } } },
    Form: { baseStyle: { helperText: { color: "fg.muted" } } },
    Input: { defaultProps: { focusBorderColor: "focus.ring" } },
  },
});

export default theme;
