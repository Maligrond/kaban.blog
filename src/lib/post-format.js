// Resolve author commands before HTML and the static search index are generated.
export const postFormat = {
  name: 'post-paragraph-format',
  paragraph(node, context) {
    const first = node.children?.[0];
    const match = first?.type === 'text' && first.value.match(/^\.(lead|loud|foot)[ \t]*\r?\n/);
    if (!match) return;
    context.setProperty(first, 'value', first.value.slice(match[0].length));
    context.setProperty(node, 'data', {
      ...node.data,
      hProperties: { ...node.data?.hProperties, className: [`post-${match[1]}`] },
    });
  },
};
