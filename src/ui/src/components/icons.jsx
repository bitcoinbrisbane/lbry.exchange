import { Icon } from "@chakra-ui/react";

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export const CopyIcon = (props) => (
  <Icon viewBox="0 0 24 24" boxSize={4} aria-hidden="true" {...props}>
    <rect x="9" y="9" width="13" height="13" rx="2" {...stroke} />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" {...stroke} />
  </Icon>
);

export const CheckIcon = (props) => (
  <Icon viewBox="0 0 24 24" boxSize={4} aria-hidden="true" {...props}>
    <path d="M20 6 9 17l-5-5" {...stroke} />
  </Icon>
);

export const SunIcon = (props) => (
  <Icon viewBox="0 0 24 24" boxSize={4} aria-hidden="true" {...props}>
    <circle cx="12" cy="12" r="4" {...stroke} />
    <path
      d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
      {...stroke}
    />
  </Icon>
);

export const MoonIcon = (props) => (
  <Icon viewBox="0 0 24 24" boxSize={4} aria-hidden="true" {...props}>
    <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" {...stroke} />
  </Icon>
);
