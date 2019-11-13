// @flow
import React, { Component } from 'react';
import styles from './FlagLabel.scss';

type Props = {|
  +svg: string,
  +label: string,
|};

export default class FlagLabel extends Component<Props> {

  render() {
    const { svg, label, } = this.props;
    const SvgElem = svg;
    return (

      <div className={styles.wrapper}>
        <span className={styles.flag}><SvgElem /></span>
        <span>{label}</span>
      </div>
    );
  }
}
