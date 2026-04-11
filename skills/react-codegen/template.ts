export function componentTemplate(name: string, props: string[] = []): string {
  const propsInterface = props.length > 0
    ? `interface ${name}Props {\n${props.map(p => `  ${p}: string;`).join("\n")}\n}\n\n`
    : `interface ${name}Props {}\n\n`;

  const propsParam = props.length > 0 ? `{ ${props.join(", ")} }: ${name}Props` : `_props: ${name}Props`;

  return `import React from "react";

${propsInterface}export const ${name} = (${propsParam}): React.JSX.Element => {
  return (
    <div className="${name.toLowerCase()}">
      {/* ${name} component */}
    </div>
  );
};

export default ${name};
`;
}
