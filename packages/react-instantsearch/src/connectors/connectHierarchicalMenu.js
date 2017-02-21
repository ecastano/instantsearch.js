import {PropTypes} from 'react';
import {omit, isEmpty, has, unset} from 'lodash';

import createConnector from '../core/createConnector';
import {SearchParameters} from 'algoliasearch-helper';

export const getId = props => props.attributes[0];

const namespace = 'hierarchicalMenu';

function getIndex(context) {
  return context && context.multiIndexContext ? context.multiIndexContext.targettedIndex : context.ais.mainTargettedIndex;
}

function hasMultipleIndex(context) {
  return context && context.multiIndexContext;
}

function getCurrentRefinement(props, searchState, context) {
  const id = getId(props);
  const index = getIndex(context);
  const refinements = hasMultipleIndex(context) && has(searchState, ['indices', index, namespace, id])
    || !hasMultipleIndex(context) && has(searchState, [namespace, id]);
  if (refinements) {
    const subState = hasMultipleIndex(context) ? searchState.indices[index][namespace] : searchState[namespace];
    if (subState[id] === '') {
      return null;
    }
    return subState[id];
  }
  if (props.defaultRefinement) {
    return props.defaultRefinement;
  }
  return null;
}

function getValue(path, props, searchState, context) {
  const {
    id,
    attributes,
    separator,
    rootPath,
    showParentLevel,
  } = props;

  const currentRefinement = getCurrentRefinement(props, searchState, context);
  let nextRefinement;

  if (currentRefinement === null) {
    nextRefinement = path;
  } else {
    const tmpSearchParameters = new SearchParameters({
      hierarchicalFacets: [{
        name: id,
        attributes,
        separator,
        rootPath,
        showParentLevel,
      }],
    });

    nextRefinement = tmpSearchParameters
      .toggleHierarchicalFacetRefinement(id, currentRefinement)
      .toggleHierarchicalFacetRefinement(id, path)
      .getHierarchicalRefinement(id)[0];
  }

  return nextRefinement;
}

function transformValue(value, limit, props, searchState, context) {
  return value.slice(0, limit).map(v => ({
    label: v.name,
    value: getValue(v.path, props, searchState, context),
    count: v.count,
    isRefined: v.isRefined,
    items: v.data && transformValue(v.data, limit, props, searchState, context),
  }));
}

function refine(props, searchState, nextRefinement, context) {
  const id = getId(props);
  const nextValue = {[id]: nextRefinement || ''};
  const index = getIndex(context);
  if (hasMultipleIndex(context)) {
    const state = has(searchState, `indices.${index}`)
      ? {...searchState.indices, [index]: {[namespace]: {...searchState.indices[index][namespace], ...nextValue}}}
      : {...searchState.indices, ...{[index]: {[namespace]: nextValue}}};
    return {...searchState, indices: state};
  } else {
    return {...searchState, [namespace]: {...searchState[namespace], ...nextValue}};
  }
}

function cleanUp(props, searchState, context) {
  const index = getIndex(context);
  const prefix = hasMultipleIndex(context) && searchState.indices ? `indices.${index}.${namespace}` : namespace;
  unset(searchState, [prefix, getId(props)]);
  if (isEmpty(searchState[namespace])) {
    return omit(searchState, namespace);
  }
  return searchState;
}

const sortBy = ['name:asc'];

/**
 * connectHierarchicalMenu connector provides the logic to build a widget that will
 * give the user the ability to explore a tree-like structure.
 * This is commonly used for multi-level categorization of products on e-commerce
 * websites. From a UX point of view, we suggest not displaying more than two levels deep.
 * @name connectHierarchicalMenu
 * @kind connector
 * @propType {string} attributes - List of attributes to use to generate the hierarchy of the menu. See the example for the convention to follow.
 * @propType {string} defaultRefinement - the item value selected by default
 * @propType {boolean} [showMore=false] - Flag to activate the show more button, for toggling the number of items between limitMin and limitMax.
 * @propType {number} [limitMin=10] -  The maximum number of items displayed.
 * @propType {number} [limitMax=20] -  The maximum number of items displayed when the user triggers the show more. Not considered if `showMore` is false.
 * @propType {string} [separator='>'] -  Specifies the level separator used in the data.
 * @propType {string[]} [rootPath=null] - The already selected and hidden path.
 * @propType {boolean} [showParentLevel=true] - Flag to set if the parent level should be displayed.
 * @propType {function} [transformItems] - If provided, this function can be used to modify the `items` provided prop of the wrapped component (ex: for filtering or sorting items). this function takes the `items` prop as a parameter and expects it back in return.
 * @providedPropType {function} refine - a function to toggle a refinement
 * @providedPropType {function} createURL - a function to generate a URL for the corresponding search state
 * @providedPropType {string} currentRefinement - the refinement currently applied
 * @providedPropType {array.<{items: object, count: number, isRefined: boolean, label: string, value: string}>} items - the list of items the HierarchicalMenu can display. items has the same shape as parent items.
 */
export default createConnector({
  displayName: 'AlgoliaHierarchicalMenu',

  propTypes: {
    attributes: (props, propName, componentName) => {
      const isNotString = val => typeof val !== 'string';
      if (!Array.isArray(props[propName]) || props[propName].some(isNotString) || props[propName].length < 1) {
        return new Error(`Invalid prop ${propName} supplied to ${componentName}. Expected an Array of Strings`);
      }
      return undefined;
    },
    separator: PropTypes.string,
    rootPath: PropTypes.string,
    showParentLevel: PropTypes.bool,
    defaultRefinement: PropTypes.string,
    showMore: PropTypes.bool,
    limitMin: PropTypes.number,
    limitMax: PropTypes.number,
    transformItems: PropTypes.func,
  },

  defaultProps: {
    showMore: false,
    limitMin: 10,
    limitMax: 20,
    separator: ' > ',
    rootPath: null,
    showParentLevel: true,
  },

  getProvidedProps(props, searchState, searchResults) {
    const {showMore, limitMin, limitMax} = props;
    const id = getId(props);
    const {results} = searchResults;
    const index = getIndex(this.context);

    const isFacetPresent =
      Boolean(results) &&
      Boolean(results[index]) &&
      Boolean(results[index].getFacetByName(id));

    if (!isFacetPresent) {
      return {
        items: [],
        currentRefinement: getCurrentRefinement(props, searchState, this.context),
        canRefine: false,
      };
    }

    const limit = showMore ? limitMax : limitMin;
    const value = results[index].getFacetValues(id, {sortBy});
    const items = value.data ? transformValue(value.data, limit, props, searchState, this.context) : [];

    return {
      items: props.transformItems ? props.transformItems(items) : items,
      currentRefinement: getCurrentRefinement(props, searchState, this.context),
      canRefine: items.length > 0,
    };
  },

  refine(props, searchState, nextRefinement) {
    return refine(props, searchState, nextRefinement, this.context);
  },

  cleanUp(props, searchState) {
    return cleanUp(props, searchState, this.context);
  },

  getSearchParameters(searchParameters, props, searchState) {
    const {
      attributes,
      separator,
      rootPath,
      showParentLevel,
      showMore,
      limitMin,
      limitMax,
    } = props;

    const id = getId(props);
    const limit = showMore ? limitMax : limitMin;

    searchParameters = searchParameters
      .addHierarchicalFacet({
        name: id,
        attributes,
        separator,
        rootPath,
        showParentLevel,
      })
      .setQueryParameters({
        maxValuesPerFacet: Math.max(
          searchParameters.maxValuesPerFacet || 0,
          limit
        ),
      });

    const currentRefinement = getCurrentRefinement(props, searchState, this.context);
    if (currentRefinement !== null) {
      searchParameters = searchParameters.toggleHierarchicalFacetRefinement(
        id,
        currentRefinement
      );
    }

    return searchParameters;
  },

  getMetadata(props, searchState) {
    const rootAttribute = props.attributes[0];
    const id = getId(props);
    const currentRefinement = getCurrentRefinement(props, searchState, this.context);

    return {
      id,
      items: !currentRefinement ? [] : [{
        label: `${rootAttribute}: ${currentRefinement}`,
        attributeName: rootAttribute,
        value: nextState => refine(props, nextState, '', this.context),
        currentRefinement,
      }],
    };
  },
});
