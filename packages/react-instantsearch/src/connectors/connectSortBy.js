import {PropTypes} from 'react';
import {omit, has} from 'lodash';

import createConnector from '../core/createConnector';

function getId() {
  return 'sortBy';
}

function getIndex(context) {
  return context && context.multiIndexContext ? context.multiIndexContext.targettedIndex : undefined;
}

function getCurrentRefinement(props, searchState, index) {
  const id = getId();
  if (has(searchState, `indices.${index}.${id}`)) {
    return searchState.indices[index][id];
  } else if (!index && searchState[id]) {
    return searchState[id];
  }
  if (props.defaultRefinement) {
    return props.defaultRefinement;
  }
  return null;
}

/**
 * connectSortBy connector provides the logic to build a widget that will
 *  displays a list of indexes allowing a user to change the hits are sorting.
 * @name connectSortBy
 * @kind connector
 * @propType {string} defaultRefinement - The default selected index.
 * @propType {{value, label}[]} items - The list of indexes to search in.
 * @propType {function} [transformItems] - If provided, this function can be used to modify the `items` provided prop of the wrapped component (ex: for filtering or sorting items). this function takes the `items` prop as a parameter and expects it back in return.
 * @providedPropType {function} refine - a function to remove a single filter
 * @providedPropType {function} createURL - a function to generate a URL for the corresponding search state
 * @providedPropType {string[]} currentRefinement - the refinement currently applied
 * @providedPropType {array.<{isRefined: boolean, label?: string, value: string}>} items - the list of items the HitsPerPage can display.  If no label provided, the value will be displayed.
 */
export default createConnector({
  displayName: 'AlgoliaSortBy',

  propTypes: {
    defaultRefinement: PropTypes.string,
    items: PropTypes.arrayOf(PropTypes.shape({
      label: PropTypes.string,
      value: PropTypes.string.isRequired,
    })).isRequired,
    transformItems: PropTypes.func,
  },

  getProvidedProps(props, searchState) {
    const currentRefinement = getCurrentRefinement(props, searchState, getIndex(this.context));
    const items = props.items.map(item => item.value === currentRefinement
      ? {...item, isRefined: true} : {...item, isRefined: false});
    return {
      items: props.transformItems ? props.transformItems(items) : items,
      currentRefinement,
    };
  },

  refine(props, searchState, nextRefinement) {
    const id = getId();
    const sortByState = this.context.multiIndexContext ?
      {indices: {[this.context.multiIndexContext.targettedIndex]: {[id]: nextRefinement}}}
      : {[id]: nextRefinement};
    const state = {
      ...searchState,
      ...sortByState,
    };
    return state;
  },

  cleanUp(props, searchState) {
    if (this.context.multiIndexContext && searchState.indices) {
      const index = this.context.multiIndexContext.targettedIndex;
      return {...searchState, ...{indices: {[index]: omit(searchState.indices[index], getId())}}};
    } else {
      return omit(searchState, getId());
    }
  },

  getSearchParameters(searchParameters, props, searchState) {
    const selectedIndex = getCurrentRefinement(props, searchState, getIndex(this.context));
    return searchParameters.setIndex(selectedIndex);
  },

  getMetadata() {
    return {id: getId()};
  },
});
