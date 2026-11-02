/** Hands a code fence's meta (```vue title="App.vue" tab="vue") to the code element as a `metastring` prop. */
export default function rehypeCodeMeta() {
  const walk = (node) => {
    if (node.tagName === 'code' && node.data?.meta)
      node.properties = { ...node.properties, metastring: node.data.meta };
    node.children?.forEach(walk);
  };
  return walk;
}
