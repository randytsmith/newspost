/** @jsx React.DOM */

'use strict';

var moment = require('moment')
var React = require('react')
var ReactFireMixin = require('reactfire')
var Router = require('react-router')

var HNService = require('./services/HNService')
var ItemStore = require('./stores/ItemStore')

var Spinner = require('./Spinner')

var cx = require('./utils/buildClassName')
var pluralise = require('./utils/pluralise')
var setTitle = require('./utils/setTitle')

var Link = Router.Link
var Navigation = Router.Navigation

var Comment = React.createClass({
  mixins: [ReactFireMixin, Navigation],
  getDefaultProps: function() {
    return {
      comment: null
    , level: 0
    , maxCommentId: 0
    , permalinked: false
    , permalinkThread: false
    , showSpinner: false
    , threadStore: null
    }
  },

  getInitialState: function() {
    return {
      comment: this.props.comment || {}
    , parent: {type: 'comment'}
    , op: {}
    , collapsed: false
    }
  },

  componentWillMount: function() {
    if (this.props.comment === null) {
      this.bindAsObject(HNService.itemRef(this.props.id || this.props.params.id), 'comment')
    }
    else {
      this.fetchAncestors()
    }
  },

  componentWillUpdate: function(nextProps, nextState) {
    if (this.props.permalinked) {
      // Redirect to the appropriate route if a Comment "parent" link had a
      // non-comment item id.
      if (this.state.comment.id != nextState.comment.id) {
        if (nextState.comment.type != 'comment') {
          this.replaceWith(nextState.comment.type, {id: nextState.comment.id})
          return
        }
      }
    }
  },

  setTitle: function() {
    var title = 'Comment by ' + this.state.comment.by
    if (this.state.op.id) {
      title += ' | ' + this.state.op.title
    }
    setTitle(title)
  },

  componentDidUpdate: function(prevProps, prevState) {
    if (this.shouldUseCommentStore()) {
      // Register a newly-loaded, non-deleted comment with the thread store
      if (!prevState.comment.id && this.state.comment.id && !this.state.comment.deleted) {
        this.props.threadStore.commentAdded(this.state.comment)
      }
      // Let the store know if the comment got deleted
      else if (prevState.comment.id && !prevState.comment.deleted && this.state.comment.deleted) {
        this.props.threadStore.commentDeleted(this.state.comment)
      }
    }

    if (this.props.permalinked) {
      // Fetch ancestors so we can link to the appropriate parent type and show
      // OP info.
      if (this.state.comment.parent != prevState.comment.parent) {
        this.fetchAncestors()
      }

      this.setTitle()
    }
  },

  componentWillReceiveProps: function(nextProps) {
    // If the top-level comment id changes (i.e. a "parent" or "link" link is
    // used on a permalinked comment page, or the URL is edited), we need to
    // start listening for updates to the new item id.
    if (this.props.permalinked && this.props.params.id != nextProps.params.id) {
      this.unbind('comment')
      this.bindAsObject(HNService.itemRef(nextProps.params.id), 'comment')
    }
  },

  shouldUseCommentStore: function() {
    return (!this.isInPermalinkThread() && this.props.comment === null)
  },

  shouldLinkToParent: function() {
    return (this.props.permalinked || this.props.comment !== null)
  },

  fetchAncestors: function() {
    ItemStore.fetchCommentAncestors(this.state.comment, function(result) {
      if ("production" !== process.env.NODE_ENV) {
        console.info(
          'fetchAncestors(' + this.state.comment.id + ') took ' +
          result.timeTaken + ' ms for ' +
          result.itemCount + ' item' + pluralise(result.itemCount) + ' with ' +
          result.cacheHits + ' cache hit' + pluralise(result.cacheHits) + ' ('  +
          (result.cacheHits / result.itemCount * 100).toFixed(1) + '%)'
        )
      }
      if (!this.isMounted()) {
        if ("production" !== process.env.NODE_ENV) {
          console.info("...but the comment isn't mounted")
        }
        // Too late - the comment or the user has moved elsewhere
        return
      }
      this.setState({
        parent: result.parent
      , op: result.op
      })
    }.bind(this))
  },

  /**
   * Determine if this comment is permalinked or is being displayed under a
   * permalinked comment.
   */
  isInPermalinkThread: function() {
    return (this.props.permalinked || this.props.permalinkThread)
  },

  /**
   * Determine if this is a new comment.
   */
  isNew: function() {
    return (this.props.maxCommentId > 0 &&
            this.props.id > this.props.maxCommentId)
  },

  toggleCollapsed: function(e) {
    e.preventDefault()
    this.setState({collapsed: !this.state.collapsed})
  },

  render: function() {
    var props = this.props
    var state = this.state
    var comment = state.comment

    // Render a placeholder while we're waiting for the comment to load
    if (!comment.id) {
      return <div className={cx(
        'Comment Comment--loading Comment--level' + props.level,
        {'Comment--new': this.isNew()
      })}>
        {(props.permalinked || props.showSpinner ) && <Spinner size="20"/>}
        {comment.error && <p>Error loading comment - this may be because the author has configured a delay.</p>}
      </div>
    }

    // XXX Don't render anything if we're replacing the route after loading a non-comment
    if (comment.type != 'comment') { return null }

    // Don't render anything for deleted comments with no kids
    if (comment.deleted && !comment.kids) { return null }

    var showParentLink = this.shouldLinkToParent()
    var showOPLink = ((this.props.permalinked || this.props.comment !== null) && state.op.id)
    // Don't show the parent link if the OP is the parent
    if (showOPLink && showParentLink && state.op.id == comment.parent) {
      showParentLink = false
    }
    var showChildCount = (props.threadStore && state.collapsed)
    var childCount = (showChildCount && props.threadStore.getChildCount(comment))

    return <div className={cx('Comment Comment--level' + props.level, {
      'Comment--collapsed': state.collapsed
    , 'Comment--dead': comment.dead
    , 'Comment--deleted': comment.deleted
    , 'Comment--new': this.isNew()
    })}>
      <div className="Comment__content">
        {comment.deleted && <div className="Comment__meta">
          {this.renderCollapseControl()}{' '}
          [deleted]
        </div>}
        {!comment.deleted && <div className="Comment__meta">
          {this.renderCollapseControl()}{' '}
          <Link to="user" params={{id: comment.by}} className="Comment__user">{comment.by}</Link>{' '}
          {moment(comment.time * 1000).fromNow()}
          {!props.permalinked && ' | '}
          {!props.permalinked && <Link to="comment" params={{id: comment.id}}>link</Link>}
          {showParentLink && ' | '}
          {showParentLink && <Link to={state.parent.type} params={{id: comment.parent}}>parent</Link>}
          {showOPLink && ' | on: '}
          {showOPLink && <Link to={state.op.type} params={{id: state.op.id}}>
            {state.op.title}
          </Link>}
          {comment.dead &&  ' | [dead]'}
          {showChildCount && ' | (' +  childCount + ' child' + pluralise(childCount, ',ren') + ')'}
        </div>}
        {!comment.deleted && <div className="Comment__text">
          <div dangerouslySetInnerHTML={{__html: comment.text}}/>
        </div>}
      </div>
      {this.props.comment === null && comment.kids && <div className="Comment__kids">
        {comment.kids.map(function(id, index) {
          return <Comment key={id} id={id}
            level={props.level + 1}
            showSpinner={props.showSpinner || (props.permalinked && index === 0)}
            permalinkThread={props.permalinkThread || props.permalinked}
            maxCommentId={props.maxCommentId}
            threadStore={props.threadStore}
          />
        })}
      </div>}
    </div>
  },

  renderCollapseControl: function() {
    return <span className="Comment__collapse" onClick={this.toggleCollapsed} onKeyPress={this.toggleCollapsed} tabIndex="0">
      [{this.state.collapsed ? '+' : '–'}]
    </span>
  }
})

module.exports = Comment