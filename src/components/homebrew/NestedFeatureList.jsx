import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { nestFeatures } from '../../lib/homebrew'

// One level's features, with each feature's sub-features (Metamagic's
// options, Dark Arts' arts) boxed underneath the feature that introduces
// them instead of floating beside it. Shared by the class detail page (base
// features and each subclass's features) and the standalone subclass page,
// which all used to repeat this markup with slightly different heading
// levels — hence `headingLevel` rather than three near-copies.
export default function NestedFeatureList({ features, headingLevel = 3 }) {
  const Heading = `h${headingLevel}`
  const SubHeading = `h${Math.min(headingLevel + 2, 6)}`

  return nestFeatures(features).map((node) => (
    <div key={node.feature.id ?? node.feature.name} className="homebrew-feature">
      <Heading>{node.feature.name}</Heading>
      {node.feature.description && (
        <div className="homebrew-markdown">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{node.feature.description}</ReactMarkdown>
        </div>
      )}
      {node.children.length > 0 && (
        <div className="homebrew-choice-group">
          <p className="homebrew-group-label">
            {node.choiceCount === 0
              ? `${node.feature.name} options`
              : `Choose ${node.choiceCount} of the following`}
          </p>
          {node.children.map((child) => (
            <div key={child.id ?? child.name} className="homebrew-choice-feature">
              <SubHeading>{child.name}</SubHeading>
              {child.description && (
                <div className="homebrew-markdown">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{child.description}</ReactMarkdown>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  ))
}
