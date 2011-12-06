/*
 * jsPlumb
 * 
 * Title:jsPlumb 1.3.4
 * 
 * Provides a way to visually connect elements on an HTML page, using either SVG, Canvas
 * elements, or VML.  
 * 
 * This file contains the jsPlumb core code.
 *
 * Copyright (c) 2010 - 2011 Simon Porritt (simon.porritt@gmail.com)
 * 
 * http://jsplumb.org
 * http://code.google.com/p/jsplumb
 * 
 * Triple licensed under the MIT, GPL2 and Beer licenses.
 */

;(function() {
	
	/**
	 * Class:jsPlumb
	 * The jsPlumb engine, registered as a static object in the window.  This object contains all of the methods you will use to
	 * create and maintain Connections and Endpoints.
	 */	
	
	var canvasAvailable = !!document.createElement('canvas').getContext,
		svgAvailable = !!window.SVGAngle || document.implementation.hasFeature("http://www.w3.org/TR/SVG11/feature#BasicStructure", "1.1"),
	// TODO what is a good test for VML availability? aside from just assuming its there because nothing else is.
		vmlAvailable = !(canvasAvailable | svgAvailable);
	
	// finds the index of some value in an array, using a deep equals test.
	var _findIndex = function(a, v, b, s) {
		var _eq = function(o1, o2) {
			if (o1 === o2) return true;
			else if (typeof o1 == "object" && typeof o2 == "object") {
				var same = true;
				for ( var propertyName in o1) {
					if (!_eq(o1[propertyName], o2[propertyName])) {
						same = false;
						break;
					}
				}
				for ( var propertyName in o2) {
					if (!_eq(o2[propertyName], o1[propertyName])) {
						same = false;
						break;
					}
				}
				return same;
			}
		};

		for ( var i = +b || 0, l = a.length; i < l; i++) {
			if (_eq(a[i], v))
				return i;
		}
		return -1;
	};
	
	// for those browsers that dont have it, Array.find using a function.
	Array.prototype.find = Array.prototype.find || function(f) {
  		for (var i = 0; i < this.length; i++) if (f(this[i])) return i;
		return -1;
	};
	
	// for thos browsers that dont have it.
	if (!window.console)
		window.console = { time:function(){}, timeEnd:function(){}, group:function(){}, groupEnd:function(){}, log:function(){} };
	
	/**
		 * helper method to add an item to a list, creating the list if it does
		 * not yet exist.
		 */
		var _addToList = function(map, key, value) {
			var l = map[key];
			if (l == null) {
				l = [], map[key] = l;
			}
			l.push(value);
			return l;
		},
		_clearLists = function(listsToClear) {
			for (var i in listsToClear) {
				if (listsToClear[i] != null) listsToClear[i].splice(0,0,listsToClear[i].length);
			}
		},
		_connectionBeingDragged = null,
		_getAttribute = function(el, attName) { return jsPlumb.CurrentLibrary.getAttribute(_getElementObject(el), attName); },
		_setAttribute = function(el, attName, attValue) { jsPlumb.CurrentLibrary.setAttribute(_getElementObject(el), attName, attValue); },
		_addClass = function(el, clazz) { jsPlumb.CurrentLibrary.addClass(_getElementObject(el), clazz); },
		_hasClass = function(el, clazz) { return jsPlumb.CurrentLibrary.hasClass(_getElementObject(el), clazz); },
		_removeClass = function(el, clazz) { jsPlumb.CurrentLibrary.removeClass(_getElementObject(el), clazz); },
		_getElementObject = function(el) { return jsPlumb.CurrentLibrary.getElementObject(el); },
		_getOffset = function(el) { return jsPlumb.CurrentLibrary.getOffset(_getElementObject(el)); },
		_getSize = function(el) { return jsPlumb.CurrentLibrary.getSize(_getElementObject(el)); },
		_logEnabled = false,
		_log = function(jsp, msg) {
			if (jsp.logEnabled && typeof console != "undefined")
				console.log(msg);
		},
		_group = function(g) {
			if (_logEnabled && typeof console != "undefined") console.group(g);
		},
		_groupEnd = function(g) {
			if (_logEnabled && typeof console != "undefined") console.groupEnd(g);
		}
		_time = function(t) {
			if (_logEnabled && typeof console != "undefined") console.time(t);
		}
		_timeEnd = function(t) {
			if (_logEnabled && typeof console != "undefined") console.timeEnd(t);
		};
		
		/**
		 * EventGenerator
		 * Superclass for objects that generate events - jsPlumb extends this, as does jsPlumbUIComponent, which all the UI elements extend.
		 */
		EventGenerator = function() {
			var _listeners = {}, self = this;
			
			// this is a list of events that should re-throw any errors that occur during their dispatch. as of 1.3.0 this is private to
			// jsPlumb, but it seems feasible that people might want to manipulate this list.  the thinking is that we don't want event
			// listeners to bring down jsPlumb - or do we.  i can't make up my mind about this, but i know i want to hear about it if the "ready"
			// event fails, because then my page has most likely not initialised.  so i have this halfway-house solution.  it will be interesting
			// to hear what other people think.
			var eventsToDieOn = [ "ready" ];
								    
			/*
			 * Binds a listener to an event.  
			 * 
			 * Parameters:
			 * 	event		-	name of the event to bind to.
			 * 	listener	-	function to execute.
			 */
			this.bind = function(event, listener) {
				_addToList(_listeners, event, listener);				
			};
			/*
			 * Fires an update for the given event.
			 * 
			 * Parameters:
			 * 	event				-	event to fire
			 * 	value				-	value to pass to the event listener(s).
			 *  o	riginalEvent	- 	the original event from the browser
			 */			
			this.fire = function(event, value, originalEvent) {
				if (_listeners[event]) {
					for ( var i = 0; i < _listeners[event].length; i++) {
						// doing it this way rather than catching and then possibly re-throwing means that an error propagated by this
						// method will have the whole call stack available in the debugger.
						if (_findIndex(eventsToDieOn, event) != -1)
							_listeners[event][i](value, originalEvent);
						else {
							// for events we don't want to die on, catch and log.
							try {
								_listeners[event][i](value, originalEvent);
							} catch (e) {
								_log("jsPlumb: fire failed for event " + event + " : " + e);
							}
						}
					}
				}
			};
			/*
			 * Clears either all listeners, or listeners for some specific event.
			 * 
			 * Parameters:
			 * 	event	-	optional. constrains the clear to just listeners for this event.
			 */
			this.clearListeners = function(event) {
				if (event)
					delete _listeners[event];
				else {
					delete _listeners;
					_listeners = {};
				}
			};
			
			this.getListener = function(forEvent) {
				return _listeners[forEvent];
			};		
		},
		
				/**
		 * creates a timestamp, using milliseconds since 1970, but as a string.
		 */
		_timestamp = function() { return "" + (new Date()).getTime(); },
		
		/*
		 * Class:jsPlumbUIComponent
		 * Abstract superclass for UI components Endpoint and Connection.  Provides the abstraction of paintStyle/hoverPaintStyle,
		 * and also extends EventGenerator to provide the bind and fire methods.
		 */
		jsPlumbUIComponent = function(params) {
			var self = this, a = arguments, _hover = false, parameters = params.parameters || {}, idPrefix = self.idPrefix,
			id = idPrefix + (new Date()).getTime();
			self._jsPlumb = params["_jsPlumb"];			
			self.getId = function() { return id; };
			self.tooltip = params.tooltip;
			self.hoverClass = params.hoverClass;				
			
			// all components can generate events
			EventGenerator.apply(this);
			// all components get this clone function.
			// TODO issue 116 showed a problem with this - it seems 'a' that is in
			// the clone function's scope is shared by all invocations of it, the classic
			// JS closure problem.  for now, jsPlumb does a version of this inline where 
			// it used to call clone.  but it would be nice to find some time to look
			// further at this.
			this.clone = function() {
				var o = new Object();
				self.constructor.apply(o, a);
				return o;
			};
			
			this.getParameter = function(name) { return parameters[name]; },
			this.getParameters = function() { return parameters; },
			this.setParameter = function(name, value) { parameters[name] = value; },
			this.setParameters = function(p) { parameters = p; },			
			this.overlayPlacements = [], 
			this.paintStyle = null, 
			this.hoverPaintStyle = null;
			
			// user can supply a beforeDetach callback, which will be executed before a detach
			// is performed; returning false prevents the detach.
			var beforeDetach = params.beforeDetach;
			this.isDetachAllowed = function(connection) {
				var r = self._jsPlumb.checkCondition("beforeDetach", connection);
				if (beforeDetach) {
					try { 
						r = beforeDetach(connection); 
					}
					catch (e) { _log("jsPlumb: beforeDetach callback failed", e); }
				}
				return r;
			};
			
			// user can supply a beforeDrop callback, which will be executed before a dropped
			// connection is confirmed. user can return false to reject connection.
			var beforeDrop = params.beforeDrop;
			this.isDropAllowed = function(connection) {
				var r = self._jsPlumb.checkCondition("beforeDrop", connection);
				if (beforeDrop) {
					try { 
						r = beforeDrop(connection); 
					}
					catch (e) { _log("jsPlumb: beforeDrop callback failed", e); }
				}
				return r;
			};
			
			// helper method to update the hover style whenever it, or paintStyle, changes.
			// we use paintStyle as the foundation and merge hoverPaintStyle over the
			// top.
			var _updateHoverStyle = function() {
				if (self.paintStyle && self.hoverPaintStyle) {
					var mergedHoverStyle = {};
					jsPlumb.extend(mergedHoverStyle, self.paintStyle);
					jsPlumb.extend(mergedHoverStyle, self.hoverPaintStyle);
					delete self.hoverPaintStyle;
					// we want the fillStyle of paintStyle to override a gradient, if possible.
					if (mergedHoverStyle.gradient && self.paintStyle.fillStyle)
						delete mergedHoverStyle.gradient;
					self.hoverPaintStyle = mergedHoverStyle;
				}
			};
			
			/*
		     * Sets the paint style and then repaints the element.
		     * 
		     * Parameters:
		     * 	style - Style to use.
		     */
		    this.setPaintStyle = function(style, doNotRepaint) {
		    	self.paintStyle = style;
		    	self.paintStyleInUse = self.paintStyle;
		    	_updateHoverStyle();
		    	if (!doNotRepaint) self.repaint();
		    };
		    
		    /*
		     * Sets the paint style to use when the mouse is hovering over the element. This is null by default.
		     * The hover paint style is applied as extensions to the paintStyle; it does not entirely replace
		     * it.  This is because people will most likely want to change just one thing when hovering, say the
		     * color for example, but leave the rest of the appearance the same.
		     * 
		     * Parameters:
		     * 	style - Style to use when the mouse is hovering.
		     *  doNotRepaint - if true, the component will not be repainted.  useful when setting things up initially.
		     */
		    this.setHoverPaintStyle = function(style, doNotRepaint) {		    	
		    	self.hoverPaintStyle = style;
		    	_updateHoverStyle();
		    	if (!doNotRepaint) self.repaint();
		    };
		    
		    /*
		     * sets/unsets the hover state of this element.
		     * 
		     * Parameters:
		     * 	hover - hover state boolean
		     * 	ignoreAttachedElements - if true, does not notify any attached elements of the change in hover state.  used mostly to avoid infinite loops.
		     */
		    this.setHover = function(hover, ignoreAttachedElements, timestamp) {
		    	_hover = hover;
				if (self.hoverClass != null && self.canvas != null) {
					if (hover) 
						jpcl.addClass(self.canvas, self.hoverClass);						
					else
						jpcl.removeClass(self.canvas, self.hoverClass);
				}
		    	if (self.hoverPaintStyle != null) {
					self.paintStyleInUse = hover ? self.hoverPaintStyle : self.paintStyle;
					timestamp = timestamp || _timestamp();
					self.repaint({timestamp:timestamp});					
				}
				// get the list of other affected elements, if supported by this component.
				// for a connection, its the endpoints.  for an endpoint, its the connections! surprise.
				if (self.getAttachedElements && !ignoreAttachedElements)
					_updateAttachedElements(hover);
		    };
		    
		    this.isHover = function() { return _hover; };

			var jpcl = jsPlumb.CurrentLibrary,
				events = [ "click", "dblclick", "mouseenter", "mouseout", "mousemove", "mousedown", "mouseup" ],
				eventFilters = { "mouseout":"mouseexit" },
				bindOne = function(o, c, evt) {
					var filteredEvent = eventFilters[evt] || evt;
					jpcl.bind(o, evt, function(ee) {
						c.fire(filteredEvent, c, ee);
					});
				},
				unbindOne = function(o, evt) {
					var filteredEvent = eventFilters[evt] || evt;
					jpcl.unbind(o, evt);
				};
		    
		    this.attachListeners = function(o, c) {
				for (var i = 0; i < events.length; i++) {
					bindOne(o, c, events[i]); 			
				}
			};
		    
		    var _updateAttachedElements = function(state, timestamp) {
		    	var affectedElements = self.getAttachedElements();		// implemented in subclasses
		    	if (affectedElements) {
		    		for (var i = 0; i < affectedElements.length; i++) {
		    			affectedElements[i].setHover(state, true, timestamp);			// tell the attached elements not to inform their own attached elements.
		    		}
		    	}
		    };
		    
		    this.reattachListenersForElement = function(o, c) {
		    	for (var i = 0; i < events.length; i++)
		    		unbindOne(o, events[i]);
		    	self.attachListeners(o, c);
		    };
		};		
		
		var jsPlumbInstance = function(_defaults) {
		
		/*
		 * Property: Defaults 
		 * 
		 * These are the default settings for jsPlumb.  They are what will be used if you do not supply specific pieces of information 
		 * to the various API calls. A convenient way to implement your own look and feel can be to override these defaults 
		 * by including a script somewhere after the jsPlumb include, but before you make any calls to jsPlumb.
		 * 
		 * Properties:
		 * 	-	*Anchor*				The default anchor to use for all connections (both source and target). Default is "BottomCenter".
		 * 	-	*Anchors*				The default anchors to use ([source, target]) for all connections. Defaults are ["BottomCenter", "BottomCenter"].
		 * 	-	*Connector*				The default connector definition to use for all connections.  Default is "Bezier".
		 *  -   *Container*				Optional selector or element id that instructs jsPlumb to append elements it creates to a specific element. 
		 * 	-	*DragOptions*			The default drag options to pass in to connect, makeTarget and addEndpoint calls. Default is empty.
		 * 	-	*DropOptions*			The default drop options to pass in to connect, makeTarget and addEndpoint calls. Default is empty.
		 * 	-	*Endpoint*				The default endpoint definition to use for all connections (both source and target).  Default is "Dot".
		 * 	-	*Endpoints*				The default endpoint definitions ([ source, target ]) to use for all connections.  Defaults are ["Dot", "Dot"].
		 * 	-	*EndpointStyle*			The default style definition to use for all endpoints. Default is fillStyle:"#456".
		 * 	-	*EndpointStyles*		The default style definitions ([ source, target ]) to use for all endpoints.  Defaults are empty.
		 * 	-	*EndpointHoverStyle*	The default hover style definition to use for all endpoints. Default is null.
		 * 	-	*EndpointHoverStyles*	The default hover style definitions ([ source, target ]) to use for all endpoints. Defaults are null.
		 * 	-	*HoverPaintStyle*		The default hover style definition to use for all connections. Defaults are null.
		 * 	-	*LabelStyle*			The default style to use for label overlays on connections.
		 * 	-	*LogEnabled*			Whether or not the jsPlumb log is enabled. defaults to false.
		 * 	-	*Overlays*				The default overlay definitions. Defaults to an empty list.
		 * 	-	*MaxConnections*		The default maximum number of connections for an Endpoint.  Defaults to 1.
		 * 	-	*MouseEventsEnabled*	Whether or not mouse events are enabled when using the canvas renderer.  Defaults to true.  
		 * 							The idea of this is just to give people a way to prevent all the mouse listeners from activating if they know they won't need mouse events.
		 * 	-	*PaintStyle*			The default paint style for a connection. Default is line width of 8 pixels, with color "#456".
		 * 	-	*RenderMode*			What mode to use to paint with.  If you're on IE<9, you don't really get to choose this.  You'll just get VML.  Otherwise, the jsPlumb default is to use Canvas elements.
		 * 	-	*Scope*				The default "scope" to use for connections. Scope lets you assign connections to different categories. 
		 */
		this.Defaults = {
			Anchor : "BottomCenter",
			Anchors : [ null, null ],
			Connector : "Bezier",
			DragOptions : { },
			DropOptions : { },
			Endpoint : "Dot",
			Endpoints : [ null, null ],
			EndpointStyle : { fillStyle : "#456" },
			EndpointStyles : [ null, null ],
			EndpointHoverStyle : null,
			EndpointHoverStyles : [ null, null ],
			HoverPaintStyle : null,
			LabelStyle : { color : "black" },
			LogEnabled : false,
			Overlays : [ ],
			MaxConnections : 1,
			MouseEventsEnabled : true, 
			PaintStyle : { lineWidth : 8, strokeStyle : "#456" },
			RenderMode : "canvas",
			Scope : "_jsPlumb_DefaultScope"
		};
		if (_defaults) jsPlumb.extend(this.Defaults, _defaults);
		
		this.logEnabled = this.Defaults.LogEnabled;

		EventGenerator.apply(this);
		var _bb = this.bind;
		this.bind = function(event, fn) {
			if ("ready" === event && initialized) fn();
			else _bb(event, fn);
		};
		var _currentInstance = this,
		log = null,
		repaintFunction = function() {
			jsPlumb.repaintEverything();
		},
		automaticRepaint = true,
		repaintEverything = function() {
			if (automaticRepaint)
				repaintFunction();
		},
		resizeTimer = null,
		initialized = false,
		connectionsByScope = {},
		/**
		 * map of element id -> endpoint lists. an element can have an arbitrary
		 * number of endpoints on it, and not all of them have to be connected
		 * to anything.
		 */
		endpointsByElement = {},
		connectionManagingAnchors = {},
		endpointsByUUID = {},
		offsets = {},
		offsetTimestamps = {},
		floatingConnections = {},
		draggableStates = {},
		_mouseEventsEnabled = this.Defaults.MouseEventsEnabled,
		canvasList = [],
		sizes = [],
		listeners = {}, // a map: keys are event types, values are lists of listeners.
		DEFAULT_SCOPE = this.Defaults.Scope,
		renderMode = null,  // will be set in init()							

		/**
		 * helper method to add an item to a list, creating the list if it does
		 * not yet exist.
		 */
		_addToList = function(map, key, value) {
			var l = map[key];
			if (l == null) {
				l = [];
				map[key] = l;
			}
			l.push(value);
			return l;
		},

		/**
		 * appends an element to some other element, which is calculated as follows:
		 * 
		 * 1. if jsPlumb.Defaults.Container exists, use that element.
		 * 2. if the 'parent' parameter exists, use that.
		 * 3. otherwise just use the document body.
		 * 
		 */
		_appendElement = function(el, parent) {
			if (_currentInstance.Defaults.Container)
				jsPlumb.CurrentLibrary.appendElement(el, _currentInstance.Defaults.Container);
			else if (!parent)
				document.body.appendChild(el);
			else
				jsPlumb.CurrentLibrary.appendElement(el, parent);
		},

		
		_curIdStamp = 1,
		_idstamp = function() { return "" + _curIdStamp++; },		
		
		/**
		 * YUI, for some reason, put the result of a Y.all call into an object that contains
		 * a '_nodes' array, instead of handing back an array-like object like the other
		 * libraries do.
		 */
		_convertYUICollection = function(c) {
			return c._nodes ? c._nodes : c;
		},

		/**
		 * Draws an endpoint and its connections. this is the main entry point into drawing connections as well
		 * as endpoints, since jsPlumb is endpoint-centric under the hood.
		 * 
		 * @param element element to draw (of type library specific element object)
		 * @param ui UI object from current library's event system. optional.
		 * @param timestamp timestamp for this paint cycle. used to speed things up a little by cutting down the amount of offset calculations we do.
		 */
		_draw = function(element, ui, timestamp) {
					
			//_group("DRAW");
			//_time("DRAW TOTAL");
			
			var id = _getAttribute(element, "id"), endpoints = endpointsByElement[id];
			
			if (true) {
			_currentInstance.anchorManager.redraw(id, ui, timestamp);
			}
			else {
			
			//console.log("anchors for ", id, _currentInstance.anchorManager.get(id));
			
			if (!timestamp) timestamp = _timestamp();
			if (endpoints) {
			// TODO this needs refactoring.  it must be possible to calculate all the endpoints in
			// one go, and then paint affected connections. like i want to merge the continuous anchor
			// manager with the standard/dynamic anchor manager.
			//if (anchors) {
				_updateOffset( { elId : id, offset : ui, recalc : false, timestamp : timestamp }); // timestamp is checked against last update cache; it is
				// valid for one paint cycle.
				var myOffset = offsets[id], myWH = sizes[id], repaintContinous = false;
				for ( var i = 0; i < endpoints.length; i++) {
						endpoints[i].paint( { timestamp : timestamp, offset : myOffset, dimensions : myWH });
						var l = endpoints[i].connections;					
						for ( var j = 0; j < l.length; j++) {						
							l[j].paint( { elId : id, ui : ui, recalc : false, timestamp : timestamp }); // ...paint each connection.
							// then, check for dynamic endpoint; need to repaint it.						
							var oIdx = l[j].endpoints[0] == endpoints[i] ? 1 : 0,
								otherEndpoint = l[j].endpoints[oIdx];
							if (otherEndpoint.anchor.isDynamic && !otherEndpoint.isFloating()) {
								_updateOffset( { elId : otherEndpoint.elementId, timestamp : timestamp }); 							
								otherEndpoint.paint({ elementWithPrecedence:id });
								// all the connections for the other endpoint now need to be repainted
								for (var k = 0; k < otherEndpoint.connections.length; k++) {
									if (otherEndpoint.connections[k] !== l)
										otherEndpoint.connections[k].paint( { elId : id, ui : ui, recalc : false, timestamp : timestamp }); 
								}
							}
						}
				//	}
					//else repaintContinuous = true;
				}
				// we need to merge this in with the other paint code, really.  like this ends up repainting everything; why not just
				// do that on a normal drag?
								
			}
			
			}
			
			// TODO this doesn't reposition Endpoints!
				//if (repaintContinous)
		//		_currentInstance.continuousAnchorManager.recalc();
			//_timeEnd("DRAW TOTAL");
			//_groupEnd("DRAW");
		},

		/**
		 * executes the given function against the given element if the first
		 * argument is an object, or the list of elements, if the first argument
		 * is a list. the function passed in takes (element, elementId) as
		 * arguments.
		 */
		_elementProxy = function(element, fn) {
			var retVal = null;
			if (element.constructor == Array) {
				retVal = [];
				for ( var i = 0; i < element.length; i++) {
					var el = _getElementObject(element[i]), id = _getAttribute(el, "id");
					retVal.push(fn(el, id)); // append return values to what we will return
				}
			} else {
				var el = _getElementObject(element), id = _getAttribute(el, "id");
				retVal = fn(el, id);
			}
			return retVal;
		},				

		/**
		 * gets an Endpoint by uuid.
		 */
		_getEndpoint = function(uuid) { return endpointsByUUID[uuid]; },

		/**
		 * inits a draggable if it's not already initialised.
		 */
		_initDraggableIfNecessary = function(element, isDraggable, dragOptions) {
			var draggable = isDraggable == null ? _draggableByDefault : isDraggable;
			if (draggable) {
				if (jsPlumb.CurrentLibrary.isDragSupported(element) && !jsPlumb.CurrentLibrary.isAlreadyDraggable(element)) {
					var options = dragOptions || _currentInstance.Defaults.DragOptions || jsPlumb.Defaults.DragOptions;
					options = jsPlumb.extend( {}, options); // make a copy.
					var dragEvent = jsPlumb.CurrentLibrary.dragEvents['drag'];
					var stopEvent = jsPlumb.CurrentLibrary.dragEvents['stop'];
					options[dragEvent] = _wrap(options[dragEvent], function() {
						var ui = jsPlumb.CurrentLibrary.getUIPosition(arguments);
						_draw(element, ui);
						_addClass(element, "jsPlumb_dragged");
					});
					options[stopEvent] = _wrap(options[stopEvent], function() {
						var ui = jsPlumb.CurrentLibrary.getUIPosition(arguments);
						_draw(element, ui);
						_removeClass(element, "jsPlumb_dragged");
					});
					var draggable = draggableStates[_getId(element)];
					options.disabled = draggable == null ? false : !draggable;
					jsPlumb.CurrentLibrary.initDraggable(element, options);
				}
			}
		},
		
		/*
		* prepares a final params object that can be passed to _newConnection, taking into account defaults, events, etc.
		*/
		_prepareConnectionParams = function(params, referenceParams) {
			var _p = jsPlumb.extend( {}, params);
			if (referenceParams) jsPlumb.extend(_p, referenceParams);
			
			if (_p.source && _p.source.endpoint) _p.sourceEndpoint = _p.source;
			if (_p.source && _p.target.endpoint) _p.targetEndpoint = _p.target;
			
			// test for endpoint uuids to connect
			if (params.uuids) {
				_p.sourceEndpoint = _getEndpoint(params.uuids[0]);
				_p.targetEndpoint = _getEndpoint(params.uuids[1]);
			}

			// now ensure that if we do have Endpoints already, they're not full.
			if (_p.sourceEndpoint && _p.sourceEndpoint.isFull()) {
				_log(_currentInstance, "could not add connection; source endpoint is full");
				return;
			}

			if (_p.targetEndpoint && _p.targetEndpoint.isFull()) {
				_log(_currentInstance, "could not add connection; target endpoint is full");
				return;
			}			
			
			// copy in any connectorOverlays that were specified on the source endpoint.
			// it doesnt copy target endpoint overlays.  i'm not sure if we want it to or not.
			if (_p.sourceEndpoint && _p.sourceEndpoint.connectorOverlays) {
				_p.overlays = _p.overlays || [];
				for (var i = 0; i < _p.sourceEndpoint.connectorOverlays.length; i++) {
					_p.overlays.push(_p.sourceEndpoint.connectorOverlays[i]);
				}
			}
			
			// tooltip.  params.tooltip takes precedence, then sourceEndpoint.connectorTooltip.
			_p.tooltip = params.tooltip;
			if (!_p.tooltip && _p.sourceEndpoint && _p.sourceEndpoint.connectorTooltip)
				_p.tooltip = _p.sourceEndpoint.connectorTooltip;
			
			if (_p.target && !_p.target.endpoint) {
				var tid = _getId(_p.target),
				tep =_targetEndpointDefinitions[tid];

				var overrideOne = function(singlePropertyName, pluralPropertyName, tepProperty, tep) {
					if (tep[tepProperty]) {
						if (_p[pluralPropertyName]) _p[pluralPropertyName][1] = tep[tepProperty];
						else if (_p[singlePropertyName]) {
							_p[pluralPropertyName] = [ _p[singlePropertyName], tep[tepProperty] ];
							_p[singlePropertyName] = null;
						}
						else _p[pluralPropertyName] = [ null, tep[tepProperty] ];
					}
				};

				if (tep) {
					overrideOne("endpoint", "endpoints", "endpoint", tep);
					overrideOne("endpointStyle", "endpointStyles", "paintStyle", tep);
					overrideOne("endpointHoverStyle", "endpointHoverStyles", "hoverPaintStyle", tep);
				}
			}
			
			// dynamic anchors. backwards compatibility here: from 1.2.6 onwards you don't need to specify "dynamicAnchors".  the fact that some anchor consists
			// of multiple definitions is enough to tell jsPlumb you want it to be dynamic.
			if (_p.dynamicAnchors) {
				// these can either be an array of anchor coords, which we will use for both source and target, or an object with {source:[anchors], target:[anchors]}, in which
				// case we will use a different set for each element.
				var a = _p.dynamicAnchors.constructor == Array,
				sourceId = _p.sourceEndpoint ? _p.sourceEndpoint.elementId : _getId(_p.source),
				targetId = _p.targetEndpoint ? _p.targetEndpoint.elementId : _getId(_p.target),				
				sa = a ? new DynamicAnchor(jsPlumb.makeAnchors(_p.dynamicAnchors, sourceId, _currentInstance)) : new DynamicAnchor(jsPlumb.makeAnchors(_p.dynamicAnchors.source, sourceId, _currentInstance)),
				ta = a ? new DynamicAnchor(jsPlumb.makeAnchors(_p.dynamicAnchors, targetId, _currentInstance)) : new DynamicAnchor(jsPlumb.makeAnchors(_p.dynamicAnchors.target, targetId, _currentInstance));
				_p.anchors = [sa,ta];
			}
			return _p;
		},
		
		_newConnection = function(params) {
			var connectionFunc = jsPlumb.Defaults.ConnectionType || Connection,
			endpointFunc = jsPlumb.Defaults.EndpointType || Endpoint,
			parent = jsPlumb.CurrentLibrary.getParent;
			
			if (params.container)
				params["parent"] = params.container;
			else {
				if (params.sourceEndpoint)
					params["parent"] = params.sourceEndpoint.parent;
				else if (params.source.constructor == endpointFunc)
					params["parent"] = params.source.parent;
				else params["parent"] = parent(params.source);
			}
			
			params["_jsPlumb"] = _currentInstance;
			var con = new connectionFunc(params);
			con.id = "con_" + _idstamp();
			_eventFireProxy("click", "click", con);
			_eventFireProxy("dblclick", "dblclick", con);
			return con;
		},
		
		/**
		* adds the connection to the backing model, fires an event if necessary and then redraws
		*/
		_finaliseConnection = function(jpc, params) {
			// add to list of connections (by scope).
			_addToList(connectionsByScope, jpc.scope, jpc);
			// fire an event
			if (!params.doNotFireConnectionEvent) {
				_currentInstance.fire("jsPlumbConnection", {
					connection:jpc,
					source : jpc.source, target : jpc.target,
					sourceId : jpc.sourceId, targetId : jpc.targetId,
					sourceEndpoint : jpc.endpoints[0], targetEndpoint : jpc.endpoints[1]
				});
			}
			// force a paint
			_draw(jpc.source);
		},
		
		_eventFireProxy = function(event, proxyEvent, obj) {
			obj.bind(event, function(originalObject, originalEvent) {
				_currentInstance.fire(proxyEvent, obj, originalEvent);
			});
		},
		
		/**
		 * for the given endpoint params, returns an appropriate parent element for the UI elements that will be added.
		 * this function is used by _newEndpoint (directly below), and also in the makeSource function in jsPlumb.
		 * 
		 *   the logic is to first look for a "container" member of params, and pass that back if found.  otherwise we
		 *   handoff to the 'getParent' function in the current library.
		 */
		_getParentFromParams = function(params) {
			if (params.container)
				return params.container;
			else
				return jsPlumb.CurrentLibrary.getParent(params.source);
		},
		
		/**
			factory method to prepare a new endpoint.  this should always be used instead of creating Endpoints
			manually, since this method attaches event listeners and an id.
		*/
		_newEndpoint = function(params) {
			var endpointFunc = jsPlumb.Defaults.EndpointType || Endpoint;
			params.parent = _getParentFromParams(params);
			params["_jsPlumb"] = _currentInstance,
			ep = new endpointFunc(params);
			ep.id = "ep_" + _idstamp();
			_eventFireProxy("click", "endpointClick", ep);
			_eventFireProxy("dblclick", "endpointDblClick", ep);
			return ep;
		},
		
		/**
		 * performs the given function operation on all the connections found
		 * for the given element id; this means we find all the endpoints for
		 * the given element, and then for each endpoint find the connectors
		 * connected to it. then we pass each connection in to the given
		 * function.
		 */
		_operation = function(elId, func, endpointFunc) {
			var endpoints = endpointsByElement[elId];
			if (endpoints && endpoints.length) {
				for ( var i = 0; i < endpoints.length; i++) {
					for ( var j = 0; j < endpoints[i].connections.length; j++) {
						var retVal = func(endpoints[i].connections[j]);
						// if the function passed in returns true, we exit.
						// most functions return false.
						if (retVal) return;
					}
					if (endpointFunc) endpointFunc(endpoints[i]);
				}
			}
		},
		/**
		 * perform an operation on all elements.
		 */
		_operationOnAll = function(func) {
			for ( var elId in endpointsByElement) {
				_operation(elId, func);
			}
		},		
		
		/**
		 * helper to remove an element from the DOM.
		 */
		_removeElement = function(element, parent) {
			if (element != null && element.parentNode != null) {
				element.parentNode.removeChild(element);
			}
		},
		/**
		 * helper to remove a list of elements from the DOM.
		 */
		_removeElements = function(elements, parent) {
			for ( var i = 0; i < elements.length; i++)
				_removeElement(elements[i], parent);
		},
		/**
		 * helper method to remove an item from a list.
		 */
		_removeFromList = function(map, key, value) {
			if (key != null) {
				var l = map[key];
				if (l != null) {
					var i = _findIndex(l, value);
					if (i >= 0) {
						delete (l[i]);
						l.splice(i, 1);
						return true;
					}
				}
			}
			return false;
		},
		/**
		 * Sets whether or not the given element(s) should be draggable,
		 * regardless of what a particular plumb command may request.
		 * 
		 * @param element
		 *            May be a string, a element objects, or a list of
		 *            strings/elements.
		 * @param draggable
		 *            Whether or not the given element(s) should be draggable.
		 */
		_setDraggable = function(element, draggable) {
			return _elementProxy(element, function(el, id) {
				draggableStates[id] = draggable;
				if (jsPlumb.CurrentLibrary.isDragSupported(el)) {
					jsPlumb.CurrentLibrary.setDraggable(el, draggable);
				}
			});
		},
		/**
		 * private method to do the business of hiding/showing.
		 * 
		 * @param el
		 *            either Id of the element in question or a library specific
		 *            object for the element.
		 * @param state
		 *            String specifying a value for the css 'display' property
		 *            ('block' or 'none').
		 */
		_setVisible = function(el, state, alsoChangeEndpoints) {
			state = state === "block";
			var endpointFunc = null;
			if (alsoChangeEndpoints) {
				if (state) endpointFunc = function(ep) {
					ep.setVisible(true, true, true);
				};
				else endpointFunc = function(ep) {
					ep.setVisible(false, true, true);
				};
			}
			var id = _getAttribute(el, "id");
			_operation(id, function(jpc) {
				if (state && alsoChangeEndpoints) {		
					// this test is necessary because this functionality is new, and i wanted to maintain backwards compatibility.
					// this block will only set a connection to be visible if the other endpoint in the connection is also visible.
					var oidx = jpc.sourceId === id ? 1 : 0;
					if (jpc.endpoints[oidx].isVisible()) jpc.setVisible(true);
				}
				else  // the default behaviour for show, and what always happens for hide, is to just set the visibility without getting clever.
					jpc.setVisible(state);
			}, endpointFunc);
		},
		/**
		 * toggles the draggable state of the given element(s).
		 * 
		 * @param el
		 *            either an id, or an element object, or a list of
		 *            ids/element objects.
		 */
		_toggleDraggable = function(el) {
			return _elementProxy(el, function(el, elId) {
				//var state = draggableStates[elId] == null ? _draggableByDefault : draggableStates[elId];
				var state = draggableStates[elId] == null ? false : draggableStates[elId];
				state = !state;
				draggableStates[elId] = state;
				jsPlumb.CurrentLibrary.setDraggable(el, state);
				return state;
			});
		},
		/**
		 * private method to do the business of toggling hiding/showing.
		 * 
		 * @param elId
		 *            Id of the element in question
		 */
		_toggleVisible = function(elId, changeEndpoints) {
			var endpointFunc = null;
			if (changeEndpoints) {
				endpointFunc = function(ep) {
					var state = ep.isVisible();
					ep.setVisible(!state);
				};
			}
			_operation(elId, function(jpc) {
				var state = jpc.isVisible();
				jpc.setVisible(!state);				
			}, endpointFunc);
			// todo this should call _elementProxy, and pass in the
			// _operation(elId, f) call as a function. cos _toggleDraggable does
			// that.
		},
		/**
		 * updates the offset and size for a given element, and stores the
		 * values. if 'offset' is not null we use that (it would have been
		 * passed in from a drag call) because it's faster; but if it is null,
		 * or if 'recalc' is true in order to force a recalculation, we get the current values.
		 */
		_updateOffset = function(params) {
			var timestamp = params.timestamp, recalc = params.recalc, offset = params.offset, elId = params.elId;
			if (!recalc) {
				if (timestamp && timestamp === offsetTimestamps[elId])
					return offsets[elId];
			}
			if (recalc || offset == null) { // if forced repaint or no offset
											// available, we recalculate.
				// get the current size and offset, and store them
				var s = _getElementObject(elId);
				if (s != null) {
					sizes[elId] = _getSize(s);
					offsets[elId] = _getOffset(s);
					offsetTimestamps[elId] = timestamp;
				}
			} else {
				offsets[elId] = offset;
			}
			return offsets[elId];
		},

/**
		 * gets an id for the given element, creating and setting one if
		 * necessary.
		 */
		_getId = function(element, uuid) {
			var ele = _getElementObject(element);
			var id = _getAttribute(ele, "id");
			if (!id || id == "undefined") {
				// check if fixed uuid parameter is given
				if (arguments.length == 2 && arguments[1] != undefined)
					id = uuid;
				else
					id = "jsPlumb_" + _timestamp();
				_setAttribute(ele, "id", id);
			}
			return id;
		},

		/**
		 * wraps one function with another, creating a placeholder for the
		 * wrapped function if it was null. this is used to wrap the various
		 * drag/drop event functions - to allow jsPlumb to be notified of
		 * important lifecycle events without imposing itself on the user's
		 * drag/drop functionality. TODO: determine whether or not we should
		 * support an error handler concept, if one of the functions fails.
		 * 
		 * @param wrappedFunction original function to wrap; may be null.
		 * @param newFunction function to wrap the original with.
		 * @param returnOnThisValue Optional. Indicates that the wrappedFunction should 
		 * not be executed if the newFunction returns a value matching 'returnOnThisValue'.
		 * note that this is a simple comparison and only works for primitives right now.
		 */
		_wrap = function(wrappedFunction, newFunction, returnOnThisValue) {
			wrappedFunction = wrappedFunction || function() { };
			newFunction = newFunction || function() { };
			return function() {
				var r = null;
				try {
					r = newFunction.apply(this, arguments);
				} catch (e) {
					_log(_currentInstance, 'jsPlumb function failed : ' + e);
				}
				if (returnOnThisValue == null || (r !== returnOnThisValue)) {
					try {
						wrappedFunction.apply(this, arguments);
					} catch (e) {
						_log(_currentInstance, 'wrapped function failed : ' + e);
					}
				}
				return r;
			};
		};	

		/*
		 * Property: connectorClass 
		 *   The CSS class to set on Connection elements. This value is a String and can have multiple classes; the entire String is appended as-is.
		 */
		this.connectorClass = "_jsPlumb_connector";

		/*
		 * Property: endpointClass 
		 *   The CSS class to set on Endpoint elements. This value is a String and can have multiple classes; the entire String is appended as-is.
		 */
		this.endpointClass = "_jsPlumb_endpoint";

		/*
		 * Property: overlayClass 
		 * The CSS class to set on an Overlay that is an HTML element. This value is a String and can have multiple classes; the entire String is appended as-is.
		 */
		this.overlayClass = "_jsPlumb_overlay";
		
		this.Anchors = {};
		
		this.Connectors = { 
			"canvas":{},
			"svg":{},
			"vml":{}
		};

		this.Endpoints = {
			"canvas":{},
			"svg":{},
			"vml":{}
		};

		this.Overlays = {
			"canvas":{},
			"svg":{},
			"vml":{}
		};
		
// ************************ PLACEHOLDER DOC ENTRIES FOR NATURAL DOCS *****************************************
		/*
		 * Function: bind
		 * Bind to an event on jsPlumb.  
		 * 
		 * Parameters:
		 * 	event - the event to bind.  Available events on jsPlumb are:
		 *         - *jsPlumbConnection* 			: 	notification that a new Connection was established.  jsPlumb passes the new Connection to the callback.
		 *         - *jsPlumbConnectionDetached* 	: 	notification that a Connection was detached.  jsPlumb passes the detached Connection to the callback.
		 *         - *click*						:	notification that a Connection was clicked.  jsPlumb passes the Connection that was clicked to the callback.
		 *         - *dblclick*						:	notification that a Connection was double clicked.  jsPlumb passes the Connection that was double clicked to the callback.
		 *         - *endpointClick*				:	notification that an Endpoint was clicked.  jsPlumb passes the Endpoint that was clicked to the callback.
		 *         - *endpointDblClick*				:	notification that an Endpoint was double clicked.  jsPlumb passes the Endpoint that was double clicked to the callback.
		 *         
		 *  callback - function to callback. This function will be passed the Connection/Endpoint that caused the event, and also the original event.    
		 */
		
		/*
		 * Function: clearListeners
		 * Clears either all listeners, or listeners for some specific event.
		 * 
		 * Parameters:
		 * 	event	-	optional. constrains the clear to just listeners for this event.
		 */				
		
// *************** END OF PLACEHOLDER DOC ENTRIES FOR NATURAL DOCS ***********************************************************		
		
		/*
		  Function: addEndpoint 
		  	
		  Adds an <Endpoint> to a given element or elements.
		  			  
		  Parameters:
		   
		  	el - Element to add the endpoint to. Either an element id, a selector representing some element(s), or an array of either of these. 
		  	params - Object containing Endpoint constructor arguments.  For more information, see <Endpoint>.
		  	referenceParams - Object containing more Endpoint constructor arguments; it will be merged with params by jsPlumb.  You would use this if you had some 
		  					  shared parameters that you wanted to reuse when you added Endpoints to a number of elements. The allowed values in
		  					  this object are anything that 'params' can contain.  See <Endpoint>.
		  	 
		  Returns: 
		  	The newly created <Endpoint>, if el referred to a single element.  Otherwise, an array of newly created <Endpoint>s. 
		  	
		  See Also: 
		  	<addEndpoints>
		 */
		this.addEndpoint = function(el, params, referenceParams) {
			referenceParams = referenceParams || {};
			var p = jsPlumb.extend({}, referenceParams);
			jsPlumb.extend(p, params);
			p.endpoint = p.endpoint || _currentInstance.Defaults.Endpoint || jsPlumb.Defaults.Endpoint;
			p.paintStyle = p.paintStyle || _currentInstance.Defaults.EndpointStyle || jsPlumb.Defaults.EndpointStyle;
			
			// YUI wrapper
			el = _convertYUICollection(el);			
			
			var results = [], inputs = el.length && el.constructor != String ? el : [ el ];
						
			for (var i = 0; i < inputs.length; i++) {
				var _el = _getElementObject(inputs[i]), id = _getId(_el);
				p.source = _el;
				_updateOffset({ elId : id });
				var e = _newEndpoint(p);
				_addToList(endpointsByElement, id, e);
				var myOffset = offsets[id], myWH = sizes[id];
				var anchorLoc = e.anchor.compute( { xy : [ myOffset.left, myOffset.top ], wh : myWH, element : e });
				e.paint({ anchorLoc : anchorLoc });
				results.push(e);
			}
			
			return results.length == 1 ? results[0] : results;
		};
		
		/*
		  Function: addEndpoints 
		  Adds a list of <Endpoint>s to a given element or elements.
		  
		  Parameters: 
		  	target - element to add the Endpoint to. Either an element id, a selector representing some element(s), or an array of either of these. 
		  	endpoints - List of objects containing Endpoint constructor arguments. one Endpoint is created for each entry in this list.  See <Endpoint>'s constructor documentation. 
			referenceParams - Object containing more Endpoint constructor arguments; it will be merged with params by jsPlumb.  You would use this if you had some shared parameters that you wanted to reuse when you added Endpoints to a number of elements.		  	 

		  Returns: 
		  	List of newly created <Endpoint>s, one for each entry in the 'endpoints' argument. 
		  	
		  See Also:
		  	<addEndpoint>
		 */
		this.addEndpoints = function(el, endpoints, referenceParams) {
			var results = [];
			for ( var i = 0; i < endpoints.length; i++) {
				var e = _currentInstance.addEndpoint(el, endpoints[i], referenceParams);
				if (e.constructor == Array)
					Array.prototype.push.apply(results, e);
				else results.push(e);
			}
			return results;
		};

		/*
		  Function: animate 
		  This is a wrapper around the supporting library's animate function; it injects a call to jsPlumb in the 'step' function (creating
		  the 'step' function if necessary). This only supports the two-arg version of the animate call in jQuery, the one that takes an 'options' object as
		  the second arg. MooTools has only one method, a two arg one. Which is handy.  YUI has a one-arg method, so jsPlumb merges 'properties' and 'options' together for YUI.
		   
		  Parameters: 
		  	el - Element to animate. Either an id, or a selector representing the element. 
		  	properties - The 'properties' argument you want passed to the library's animate call. 
		   	options - The 'options' argument you want passed to the library's animate call.
		    
		  Returns: 
		  	void
		 */
		this.animate = function(el, properties, options) {
			var ele = _getElementObject(el), id = _getAttribute(el, "id");
			options = options || {};
			var stepFunction = jsPlumb.CurrentLibrary.dragEvents['step'];
			var completeFunction = jsPlumb.CurrentLibrary.dragEvents['complete'];
			options[stepFunction] = _wrap(options[stepFunction], function() {
				_currentInstance.repaint(id);
			});

			// onComplete repaints, just to make sure everything looks good at the end of the animation.
			options[completeFunction] = _wrap(options[completeFunction],
					function() {
						_currentInstance.repaint(id);
					});

			jsPlumb.CurrentLibrary.animate(ele, properties, options);
		};		
		
		/**
		* checks for a listener for the given condition, executing it if found, passing in the given value.
		* condition listeners would have been attached using "bind" (which is, you could argue, now overloaded, since
		* firing click events etc is a bit different to what this does).  i thought about adding a "bindCondition"
		* or something, but decided against it, for the sake of simplicity. jsPlumb will never fire one of these
		* condition events anyway.
		*/
		this.checkCondition = function(conditionName, value) {
			var l = _currentInstance.getListener(conditionName);
			var r = true;
			if (l && l.length > 0) {
				try {
					for (var i = 0 ; i < l.length; i++) {
						r = r && l[i](value); 
					}
				}
				catch (e) { _log(_currentInstance, "cannot check condition [" + conditionName + "]" + e); }
			}
			return r;
		};

		/*
		  Function: connect 
		  Establishes a <Connection> between two elements (or <Endpoint>s, which are themselves registered to elements).
		  
		  Parameters: 
		    params - Object containing constructor arguments for the Connection. See <Connection>'s constructor documentation.
		    referenceParams - Optional object containing more constructor arguments for the Connection. Typically you would pass in data that a lot of 
		    Connections are sharing here, such as connector style etc, and then use the main params for data specific to this Connection.
		     
		  Returns: 
		  	The newly created <Connection>.
		 */
		this.connect = function(params, referenceParams) {
			// prepare a final set of parameters to create connection with
			var _p = _prepareConnectionParams(params, referenceParams);
			// a connect call will delete its created endpoints on detach, unless otherwise specified.
			// this is because the endpoints belong to this connection only, and are no use to
			// anyone else, so they hang around like a bad smell.
			if (_p.deleteEndpointsOnDetach == null)
				_p.deleteEndpointsOnDetach = true;
			// TODO probably a nicer return value if the connection was not made.  _prepareConnectionParams
			// will return null (and log something) if either endpoint was full.  what would be nicer is to 
			// create a dedicated 'error' object.
			if (_p) {
				// create the connection.  it is not yet registered 
				jpc = _newConnection(_p);
				// now add it the model, fire an event, and redraw
				_finaliseConnection(jpc, _p);						
				return jpc;
			}
		};
		
		/*
		 Function: deleteEndpoint		 
		 Deletes an Endpoint and removes all Connections it has (which removes the Connections from the other Endpoints involved too)
		 
		 Parameters:
		 	object - either an <Endpoint> object (such as from an addEndpoint call), or a String UUID.
		 	
		 Returns:
		 	void		  
		 */
		this.deleteEndpoint = function(object) {
			var endpoint = (typeof object == "string") ? endpointsByUUID[object] : object;			
			if (endpoint) {
				if (!endpoint.getUuid)
					console.log("wtf?");
					
				var uuid = endpoint.getUuid();
				if (uuid) endpointsByUUID[uuid] = null;				
				endpoint.detachAll();				
				_removeElement(endpoint.canvas, endpoint.parent);
				// remove from endpointsbyElement
				// DEPRECATED.  SHOULD NOT BE NECESSARY ONCE THE ANCHOR MANAGER IS WORKING PROPERLY.
				_currentInstance.anchorManager.deleteEndpoint(endpoint);
				for (var e in endpointsByElement) {
					var endpoints = endpointsByElement[e];
					if (endpoints) {
						var newEndpoints = [];
						for (var i = 0; i < endpoints.length; i++)
							if (endpoints[i] != endpoint) newEndpoints.push(endpoints[i]);
						
						endpointsByElement[e] = newEndpoints;
					}
				}
				delete endpoint;								
			}									
		};
		
		/*
		 Function: deleteEveryEndpoint
		  Deletes every <Endpoint>, and their associated <Connection>s, in this instance of jsPlumb. Does not unregister any event listeners (this is the only difference
between this method and jsPlumb.reset).  
		  
		 Returns: 
		 	void 
		 */
		this.deleteEveryEndpoint = function() {
			for ( var id in endpointsByElement) {
				var endpoints = endpointsByElement[id];
				if (endpoints && endpoints.length) {
					for ( var i = 0; i < endpoints.length; i++) {
						_currentInstance.deleteEndpoint(endpoints[i]);
					}
				}
			}
			delete endpointsByElement;
			endpointsByElement = {};
			delete endpointsByUUID;
			endpointsByUUID = {};
		};

		var fireDetachEvent = function(jpc) {
			_currentInstance.fire("jsPlumbConnectionDetached", {
				connection:jpc,
				source : jpc.source, target : jpc.target,
				sourceId : jpc.sourceId, targetId : jpc.targetId,
				sourceEndpoint : jpc.endpoints[0], targetEndpoint : jpc.endpoints[1]
			});
		};

		/*
		  Function: detach 
		  Detaches and then removes a <Connection>.  Takes either (source, target) (the old way, maintained for backwards compatibility), or a params
		    object with various possible values.
		  		   
		  Parameters: 
		    source - id or element object of the first element in the Connection. 
		    target - id or element object of the second element in the Connection.		    
		    params - a JS object containing the same parameters as you pass to jsPlumb.connect. If this is present then neither source nor
		             target should be present; it should be the only argument to the method. See the docs for <Connection>'s constructor for information
about the parameters allowed in the params object.
		    Returns: 
		    	true if successful, false if not.
		 */
		this.detach = function(source, target) {
			if (arguments.length == 2) {
				var s = _getElementObject(source), sId = _getId(s);
				var t = _getElementObject(target), tId = _getId(t);
				_operation(sId, function(jpc) {
							if ((jpc.sourceId == sId && jpc.targetId == tId) || (jpc.targetId == sId && jpc.sourceId == tId)) {
								if (jpc.isDetachAllowed()) {
									_removeElements(jpc.connector.getDisplayElements(), jpc.parent);
									jpc.endpoints[0].removeConnection(jpc);
									jpc.endpoints[1].removeConnection(jpc);
									_removeFromList(connectionsByScope, jpc.scope, jpc);
								}
							}
						});
			}
			// this is the new version of the method, taking a JS object like
			// the connect method does.
			else if (arguments.length == 1) {
				// TODO investigate whether or not this code still works when a user has supplied their own subclass of Connection. i suspect it may not.
				if (arguments[0].constructor == Connection) {
					arguments[0].endpoints[0].detachFrom(arguments[0].endpoints[1]);
				}
				else if (arguments[0].connection) {
					arguments[0].connection.endpoints[0].detachFrom(arguments[0].connection.endpoints[1]);
				}
				else {
					var _p = jsPlumb.extend( {}, source); // a backwards compatibility hack: source should be thought of as 'params' in this case.
					// test for endpoint uuids to detach
					if (_p.uuids) {
						_getEndpoint(_p.uuids[0]).detachFrom(_getEndpoint(_p.uuids[1]));
					} else if (_p.sourceEndpoint && _p.targetEndpoint) {
						_p.sourceEndpoint.detachFrom(_p.targetEndpoint);
					} else {
						var sourceId = _getId(_p.source);
						var targetId = _getId(_p.target);
						_operation(sourceId, function(jpc) {
									if ((jpc.sourceId == sourceId && jpc.targetId == targetId) || (jpc.targetId == sourceId && jpc.sourceId == targetId)) {
										_removeElements(jpc.connector.getDisplayElements(), jpc.parent);
										jpc.endpoints[0].removeConnection(jpc);
										jpc.endpoints[1].removeConnection(jpc);
										_removeFromList(connectionsByScope, jpc.scope, jpc);
									}
						});
					}
				}
			}
		};

		/*
		  Function: detachAll 
		  Removes all an element's Connections.
		   
		  Parameters:
		  	el - either the id of the element, or a selector for the element.
		  	
		  Returns: 
		  	void
		 */
		this.detachAllConnections = function(el) {
			var id = _getAttribute(el, "id");
			var endpoints = endpointsByElement[id];
			if (endpoints && endpoints.length) {
				for ( var i = 0; i < endpoints.length; i++) {
					endpoints[i].detachAll();
				}
			}
		};
		
		/**
		 * @deprecated Use detachAllConnections instead.  this will be removed in jsPlumb 1.3.
		 */
		this.detachAll = this.detachAllConnections;

		/*
		  Function: detachEveryConnection 
		  Remove all Connections from all elements, but leaves Endpoints in place.
		   
		  Returns: 
		  	void
		  	 
		  See Also:
		  	<removeEveryEndpoint>
		 */
		this.detachEveryConnection = function() {
			for ( var id in endpointsByElement) {
				var endpoints = endpointsByElement[id];
				if (endpoints && endpoints.length) {
					for ( var i = 0; i < endpoints.length; i++) {
						endpoints[i].detachAll();
					}
				}
			}
			delete connectionsByScope;
			connectionsByScope = {};
		};
		
		/**
		 * @deprecated use detachEveryConnection instead.  this will be removed in jsPlumb 1.3.
		 */
		this.detachEverything = this.detachEveryConnection;

		/*
		  Function: draggable 
		  Initialises the draggability of some element or elements.  You should use this instead of you library's draggable method so that jsPlumb can setup the appropriate callbacks.  Your underlying library's drag method is always called from this method.
		  
		  Parameters: 
		  	el - either an element id, a list of element ids, or a selector. 
		  	options - options to pass through to the underlying library
		  	 
		  Returns: 
		  	void
		 */
		this.draggable = function(el, options) {
			if (typeof el == 'object' && el.length) {
				for ( var i = 0; i < el.length; i++) {
					var ele = _getElementObject(el[i]);
					if (ele) _initDraggableIfNecessary(ele, true, options);
				}
			} 
			else if (el._nodes) { 	// TODO this is YUI specific; really the logic should be forced
				// into the library adapters (for jquery and mootools aswell)
				for ( var i = 0; i < el._nodes.length; i++) {
					var ele = _getElementObject(el._nodes[i]);
					if (ele) _initDraggableIfNecessary(ele, true, options);
				}
			}
			else {
				var ele = _getElementObject(el);
				if (ele) _initDraggableIfNecessary(ele, true, options);
			}
		};

		/*
		  Function: extend 
		  Wraps the underlying library's extend functionality.
		  
		  Parameters: 
		  	o1 - object to extend 
		  	o2 - object to extend o1 with
		  	
		  Returns: 
		  	o1, extended with all properties from o2.
		 */
		this.extend = function(o1, o2) {
			return jsPlumb.CurrentLibrary.extend(o1, o2);
		};
		
		/*
		 * Function: getDefaultEndpointType
		 * 	Returns the default Endpoint type. Used when someone wants to subclass Endpoint and have jsPlumb return instances of their subclass.
		 *  you would make a call like this in your class's constructor:
		 *    jsPlumb.getDefaultEndpointType().apply(this, arguments);
		 * 
		 * Returns:
		 * 	the default Endpoint function used by jsPlumb.
		 */
		this.getDefaultEndpointType = function() {
			return Endpoint;
		};
		
		/*
		 * Function: getDefaultConnectionType
		 * 	Returns the default Connection type. Used when someone wants to subclass Connection and have jsPlumb return instances of their subclass.
		 *  you would make a call like this in your class's constructor:
		 *    jsPlumb.getDefaultConnectionType().apply(this, arguments);
		 * 
		 * Returns:
		 * 	the default Connection function used by jsPlumb.
		 */
		this.getDefaultConnectionType = function() {
			return Connection;
		};

		/*
		 * Function: getConnections 
		 * Gets all or a subset of connections currently managed by this jsPlumb instance.  If only one scope is passed in to this method,
		 * the result will be a list of connections having that scope (passing in no scope at all will result in jsPlumb assuming you want the
		 * default scope).  If multiple scopes are passed in, the return value will be a map of { scope -> [ connection... ] }.
		 * 
		 *  Parameters
		 *  	scope	-	if the only argument to getConnections is a string, jsPlumb will treat that string as a scope filter, and return a list
		 *                  of connections that are in the given scope.
		 *      options	-	if the argument is a JS object, you can specify a finer-grained filter:
		 *      
		 *      		-	*scope* may be a string specifying a single scope, or an array of strings, specifying multiple scopes.
		 *      		-	*source* either a string representing an element id, or a selector.  constrains the result to connections having this source.
		 *      		-	*target* either a string representing an element id, or a selector.  constrains the result to connections having this target.
		 * 
		 */
		this.getConnections = function(options) {
			if (!options) {
				options = {};
			} else if (options.constructor == String) {
				options = { "scope": options };
			}
			var prepareList = function(input) {
				var r = [];
				if (input) {
					if (typeof input == 'string')
						r.push(input);
					else
						r = input;
				}
				return r;
			};
			var scope = options.scope || jsPlumb.getDefaultScope(),
			scopes = prepareList(scope),
			sources = prepareList(options.source),
			targets = prepareList(options.target),
			filter = function(list, value) {
				return list.length > 0 ? _findIndex(list, value) != -1 : true;
			},
			results = scopes.length > 1 ? {} : [],
			_addOne = function(scope, obj) {
				if (scopes.length > 1) {
					var ss = results[scope];
					if (ss == null) {
						ss = []; results[scope] = ss;
					}
					ss.push(obj);
				} else results.push(obj);
			};
			for ( var i in connectionsByScope) {
				if (filter(scopes, i)) {
					for ( var j = 0; j < connectionsByScope[i].length; j++) {
						var c = connectionsByScope[i][j];
						if (filter(sources, c.sourceId) && filter(targets, c.targetId))
							_addOne(i, c);
					}
				}
			}
			return results;
		};

		/*
		 * Function: getAllConnections
		 * Gets all connections, as a map of { scope -> [ connection... ] }. 
		 */
		this.getAllConnections = function() {
			return connectionsByScope;
		};

		/*
		 * Function: getDefaultScope 
		 * Gets the default scope for connections and  endpoints. a scope defines a type of endpoint/connection; supplying a
		 * scope to an endpoint or connection allows you to support different
		 * types of connections in the same UI. but if you're only interested in
		 * one type of connection, you don't need to supply a scope. this method
		 * will probably be used by very few people; it's good for testing
		 * though.
		 */
		this.getDefaultScope = function() {
			return DEFAULT_SCOPE;
		};

		/*
		  Function: getEndpoint 
		  Gets an Endpoint by UUID
		   
		  Parameters: 
		  	uuid - the UUID for the Endpoint
		  	 
		  Returns: 
		  	Endpoint with the given UUID, null if nothing found.
		 */
		this.getEndpoint = _getEndpoint;
		
		/**
		 * Function:getEndpoints
		 * Gets the list of Endpoints for a given selector, or element id.
		 * @param el
		 * @return
		 */
		this.getEndpoints = function(el) {
			return endpointsByElement[_getId(el)];
		};

		/*
		 * Gets an element's id, creating one if necessary. really only exposed
		 * for the lib-specific functionality to access; would be better to pass
		 * the current instance into the lib-specific code (even though this is
		 * a static call. i just don't want to expose it to the public API).
		 */
		this.getId = _getId;
		this.getOffset = function(id) { 
			var o = offsets[id]; 
			return _updateOffset({elId:id});
		};
		this.getSize = function(id) { 
			var s = sizes[id]; 
			if (!s) _updateOffset({elId:id});
			return sizes[id];
		};		
		
		this.appendElement = _appendElement;

		/*
		  Function: hide 
		  Sets an element's connections to be hidden.
		  
		  Parameters: 
		  	el - either the id of the element, or a selector for the element.
		  	changeEndpoints - whether not to also hide endpoints on the element. by default this is false.  
		  	 
		  Returns: 
		  	void
		 */
		this.hide = function(el, changeEndpoints) {
			_setVisible(el, "none", changeEndpoints);
		};
		
		/**
		 * callback from the current library to tell us to prepare ourselves (attach
		 * mouse listeners etc; can't do that until the library has provided a bind method)
		 * @return
		 */
		this.init = function() {
			if (!initialized) {
				_currentInstance.setRenderMode(_currentInstance.Defaults.RenderMode);  // calling the method forces the capability logic to be run.
				
				var _bind = function(event) {
					jsPlumb.CurrentLibrary.bind(document, event, function(e) {
						if (!_currentInstance.currentlyDragging && _mouseEventsEnabled && renderMode == jsPlumb.CANVAS) {
							// try connections first
							for (var scope in connectionsByScope) {
				    			var c = connectionsByScope[scope];
				    			for (var i = 0; i < c.length; i++) {
				    				var t = c[i].connector[event](e);
				    				if (t) return;	
				    			}
				    		}
							for (var el in endpointsByElement) {
								var ee = endpointsByElement[el];
								for (var i = 0; i < ee.length; i++) {
									if (ee[i].endpoint[event](e)) return;
								}
							}
						}
					});
				};
				_bind("click");
				_bind("dblclick");
				_bind("mousemove");
				_bind("mousedown");
				_bind("mouseup");
				
				initialized = true;
				_currentInstance.fire("ready");
			}
		};
		
		this.log = log;
		this.jsPlumbUIComponent = jsPlumbUIComponent;
		this.EventGenerator = EventGenerator;

		/*
		 * Creates an anchor with the given params.
		 * 
		 * 
		 * Returns: The newly created Anchor.
		 */
		this.makeAnchor = function() {
			if (arguments.length == 0) return null;
			var specimen = arguments[0], elementId = arguments[1], jsPlumbInstance = arguments[2], newAnchor = null;
			if (!jsPlumbInstance) 
				throw "NO JSPLUMB SET";
			// if it appears to be an anchor already...
			if (specimen.compute && specimen.getOrientation) return specimen;  //TODO hazy here about whether it should be added or is already added somehow.
			// is it the name of an anchor type?
			else if (typeof specimen == "string") {
				newAnchor = _currentInstance.Anchors[arguments[0]]({elementId:elementId, jsPlumbInstance:_currentInstance});
			}
			// is it an array? it will be one of:
			// 		an array of [name, params] - this defines a single anchor
			//		an array of arrays - this defines some dynamic anchors
			//		an array of numbers - this defines a single anchor.				
			else if (specimen.constructor == Array) {					
				if (specimen[0].constructor == Array || specimen[0].constructor == String) {
					if (specimen.length == 2 && specimen[0].constructor == String && specimen[1].constructor == Object) {
						var pp = jsPlumb.extend({elementId:elementId, jsPlumbInstance:_currentInstance}, specimen[1]);
						newAnchor = _currentInstance.Anchors[specimen[0]](pp);
					}
					else
						newAnchor = new DynamicAnchor(specimen, null, elementId);
				}
				else {
					var anchorParams = {
						x:specimen[0], y:specimen[1],
						orientation : (specimen.length >= 4) ? [ specimen[2], specimen[3] ] : [0,0],
						offsets : (specimen.length == 6) ? [ specimen[4], specimen[5] ] : [ 0, 0 ],
						elementId:elementId
					};						
					newAnchor = new Anchor(anchorParams);
					newAnchor.clone = function() { return new Anchor(anchorParams); };						 					
				}
			}
			
			if (!newAnchor.id) newAnchor.id = "anchor_" + _idstamp();
			//jsPlumbInstance.anchorManager.add(newAnchor, elementId);
			return newAnchor;
		};

		/**
		 * makes a list of anchors from the given list of types or coords, eg
		 * ["TopCenter", "RightMiddle", "BottomCenter", [0, 1, -1, -1] ]
		 */
		this.makeAnchors = function(types, elementId, jsPlumbInstance) {
			var r = [];
			for ( var i = 0; i < types.length; i++)
				if (typeof types[i] == "string")
					r.push(_currentInstance.Anchors[types[i]]({elementId:elementId, jsPlumbInstance:jsPlumbInstance}));
				else if (types[i].constructor == Array)
					r.push(jsPlumb.makeAnchor(types[i], elementId, jsPlumbInstance));
			return r;
		};

		/**
		 * Makes a dynamic anchor from the given list of anchors (which may be in shorthand notation as strings or dimension arrays, or Anchor
		 * objects themselves) and the given, optional, anchorSelector function (jsPlumb uses a default if this is not provided; most people will
		 * not need to provide this - i think). 
		 */
		this.makeDynamicAnchor = function(anchors, anchorSelector) {
			return new DynamicAnchor(anchors, anchorSelector);
		};
		
		/**
		 * Function: makeTarget
		 * Makes some DOM element a Connection target, allowing you to drag connections to it
		 * without having to register any Endpoints on it first.  When a Connection is established,
		 * the endpoint spec that was passed in to this method is used to create a suitable 
		 * Endpoint (the default will be used if you do not provide one).
		 * 
		 * Parameters:
		 *  el		-	string id or element selector for the element to make a target.
		 * 	params	-	JS object containing parameters:
		 * 	  endpoint	optional.	specification of an endpoint to create when a connection is created.
		 * 	  scope		optional.   scope for the drop zone.
		 * 	  dropOptions optional. same stuff as you would pass to dropOptions of an Endpoint definition.
		 * 	  deleteEndpointsOnDetach  optional, defaults to true. whether or not to delete
		 *                             any Endpoints created by a connection to this target if
		 *                             the connection is subsequently detached. this will not 
		 *                             remove Endpoints that have had more Connections attached
		 *                             to them after they were created.
		 *                   	
		 * 
		 */
		var _targetEndpointDefinitions = {};
		this.makeTarget = function(el, params, referenceParams) {						
			
			var p = jsPlumb.extend({}, referenceParams);
			jsPlumb.extend(p, params);
			var jpcl = jsPlumb.CurrentLibrary,
			scope = p.scope || _currentInstance.Defaults.Scope,
			deleteEndpointsOnDetach = p.deleteEndpointsOnDetach || true,						
			_doOne = function(_el) {
				
				// get the element's id and store the endpoint definition for it.  jsPlumb.connect calls will look for one of these,
				// and use the endpoint definition if found.
				var elid = _getId(_el);
				_targetEndpointDefinitions[elid] = p.endpoint;
				
				var dropOptions = jsPlumb.extend({}, p.dropOptions || {}),
				_drop = function() {
					var draggable = _getElementObject(jpcl.getDragObject(arguments)),
						id = _getAttribute(draggable, "dragId"),				
						// restore the original scope if necessary (issue 57)
						scope = _getAttribute(draggable, "originalScope");
										
					if (scope) jpcl.setDragScope(draggable, scope);
					
					// get the connection, to then get its endpoint
					var jpc = floatingConnections[id],
						source = jpc.endpoints[0],
						_endpoint = p.endpoint ? jsPlumb.extend({}, p.endpoint) : null;
					
					// set the correct target/targetId values on the connection
					jpc.target = _el;
					jpc.targetId = _getId(_el);
					
					// ok so here we need to ensure the connection is droppable.
					var _continue = jpc.isDropAllowed(jpc);
					if (_continue) {
					
						// make a new Endpoint
						var newEndpoint = jsPlumb.addEndpoint(_el, _endpoint);
					
						var anchorPositionFinders = {
							"Fixed": function(dp, ep, es, a) {
								return [ (dp.left - ep.left) / es[0],
								         (dp.top - ep.top) / es[1] ];	
							},
							"Grid":function(dp, ep, es, a) {
								var dx = dp.left - ep.left, dy = dp.top - ep.top,
								gx = es[0] / (a.grid[0]), gy = es[1] / (a.grid[1]),
								mx = Math.floor(dx / gx), my = Math.floor(dy / gy);
								return [ ((mx * gx) + (gx / 2)) / es[0],
								         ((my * gy) + (gy / 2)) / es[1] ];
							}
						};
					
						// fixed/grid anchors will now need to be instructed where to place themselves
						if (newEndpoint.anchor.type === "Fixed" || newEndpoint.anchor.type === "Grid") {
							var dropPosition = jpcl.getUIPosition(arguments),
							elPosition = jpcl.getOffset(_el),
							elSize = jpcl.getSize(_el),
							ap = anchorPositionFinders[newEndpoint.anchor.type](dropPosition, elPosition, elSize, newEndpoint.anchor);
							newEndpoint.anchor.x = ap[0];
							newEndpoint.anchor.y = ap[1];
							// now figure an orientation for it..kind of hard to know what to do actually. probably the best thing i can do is to
							// support specifying an orientation in the anchor's spec. if one is not supplied then i will make the orientation 
							// be what will cause the most natural link to the source: it will be pointing at the source, but it needs to be
							// specified in one axis only, and so how to make that choice? i think i will use whichever axis is the one in which
							// the target is furthest away from the source.
						}
					
						var c = jsPlumb.connect({
							source:source,
							target:newEndpoint,
							scope:scope,
							// 'endpointWillMoveAfterConnection' is set by the makeSource function, and it indicates that the
							// given endpoint will actually transfer from the element it is currently attached to to some other
							// element after a connection has been established.  in that case, we do not want to fire the
							// connection event, since it will have the wrong data in it; makeSource will do it for us.
							// this is controlled by the 'parent' parameter on a makeSource call.
							doNotFireConnectionEvent:source.endpointWillMoveAfterConnection
						});
						if (deleteEndpointsOnDetach) 
							c.endpointsToDeleteOnDetach = [ newEndpoint ];
					}
					
					_currentInstance.detach(jpc, false, true, true);
				};
				
				var dropEvent = jpcl.dragEvents['drop'];
				dropOptions["scope"] = dropOptions["scope"] || scope;
				dropOptions[dropEvent] = _wrap(dropOptions[dropEvent], _drop);
				
				jpcl.initDroppable(_el, dropOptions);
			};
			
			el = _convertYUICollection(el);			
			
			var results = [], inputs = el.length && el.constructor != String ? el : [ el ];
						
			for (var i = 0; i < inputs.length; i++) {			
				_doOne(_getElementObject(inputs[i]));
			}
		};
		
		/**
		 * helper method to make a list of elements drop targets.
		 * @param els
		 * @param params
		 * @param referenceParams
		 * @return
		 */
		this.makeTargets = function(els, params, referenceParams) {
			for ( var i = 0; i < els.length; i++) {
				_currentInstance.makeTarget(els[i], params, referenceParams);				
			}
		};
		
		/**
		 * Function: makeSource
		 * Makes some DOM element a Connection source, allowing you to drag connections from it
		 * without having to register any Endpoints on it first.  When a Connection is established,
		 * the endpoint spec that was passed in to this method is used to create a suitable 
		 * Endpoint (the default will be used if you do not provide one).
		 * 
		 * Parameters:
		 *  el		-	string id or element selector for the element to make a source.
		 * 	params	-	JS object containing parameters:
		 * 	  endpoint	optional.	specification of an endpoint to create when a connection is created.
		 * 	  parent	optional.   the element to add Endpoints to when a Connection is established.  if you omit this, 
		 *                          Endpoints will be added to 'el'.
		 * 	  scope		optional.   scope for the connections dragged from this element.
		 * 	  dragOptions optional. same stuff as you would pass to dragOptions of an Endpoint definition.
		 * 	  deleteEndpointsOnDetach  optional, defaults to false. whether or not to delete
		 *                             any Endpoints created by a connection from this source if
		 *                             the connection is subsequently detached. this will not 
		 *                             remove Endpoints that have had more Connections attached
		 *                             to them after they were created.
		 *                   	
		 * 
		 */
		var _sourceEndpointDefinitions = {};
		this.makeSource = function(el, params, referenceParams) {
			var p = jsPlumb.extend({}, referenceParams);
			jsPlumb.extend(p, params);
			var jpcl = jsPlumb.CurrentLibrary,						
			_doOne = function(_el) {
				// get the element's id and store the endpoint definition for it.  jsPlumb.connect calls will look for one of these,
				// and use the endpoint definition if found.
				var elid = _getId(_el);
				_sourceEndpointDefinitions[elid] = p.endpoint || {},
				paintStyle = _sourceEndpointDefinitions[elid].paintStyle || _currentInstance.Defaults.EndpointStyles[0] || _currentInstance.Defaults.EndpointStyle,
				docEl = jpcl.getElementObject(document);																	
				
				// when the user presses the mouse, add an Endpoint
				var stopEvent = jpcl.dragEvents["stop"],
					dragOptions = jsPlumb.extend({ }, _sourceEndpointDefinitions[elid].dragOptions || {}), 
					ep = null;
					
				dragOptions[stopEvent] = function() { 
					// here we need to do a couple of things;
					// first determine whether or not a connection was dragged. if not, just delete this endpoint.
					// ...if so, though, then we need to check to see if a 'parent' was specified in the 
					// options to makeSource.  a 'parent' is a reference to an element other than the one from
					// which the connection is dragged, and it indicates that after a successful connection, the
					// endpoint should be moved off of this element and onto 'parent', using all of the
					// options passed in to the makeSource call.  
					//
					// one thing that occurs to me right now is that we dont really want the first 
					// connection to have fired a connection event.  but how can we prevent it from doing so?
					//
					//
					if (ep.connections.length == 0)
						jsPlumb.deleteEndpoint(ep);
					else {
						
						jpcl.unbind(ep.canvas, "mousedown");  // HMM. has this messed up the drag and drop?
								
						// reset the anchor to the anchor that was initially provided. the one we were using to drag
						// the connection was just a placeholder that was located at the place the user pressed the
						// mouse button to initiate the drag.
						var anchorDef = _sourceEndpointDefinitions[elid].anchor || _currentInstance.Defaults.Anchor;
						ep.anchor = jsPlumb.makeAnchor(anchorDef, elid, _currentInstance);
						// TODO ADD TO ANCHOR MANAGER
						
						if (p.parent) {						
							var parent = jpcl.getElementObject(p.parent);
							if (parent) {	
								var currentId = ep.elementId;
								ep.setElement(parent);
								_currentInstance.anchorManager.rehomeEndpoint(currentId, parent);
								var jpc = ep.connections[0]; // TODO will this always be correct?
								_currentInstance.fire("jsPlumbConnection", {
									connection:jpc,
									source : jpc.source, target : jpc.target,
									sourceId : jpc.sourceId, targetId : jpc.targetId,
									sourceEndpoint : jpc.endpoints[0], targetEndpoint : jpc.endpoints[1]
								});
								_currentInstance.repaintEverything();
							}
						}
						/*else*/ 
						_currentInstance.repaint(elid);												
					}
				};
				jpcl.bind(_el, "mousedown", function(e) {										
					_updateOffset({elId:elid});				
					var myOffset = offsets[elid], 
					myWH = sizes[elid], 
					x = (e.pageX - myOffset.left) / myWH[0], 
					y = (e.pageY - myOffset.top) / myWH[1];
					
					// we need to override the anchor in here, and force 'isSource', but we don't want to mess with
					// the params passed in, because after a connection is established we're going to reset the endpoint
					// to have the anchor we were given.
					var tempEndpointParams = {};
					jsPlumb.extend(tempEndpointParams, _sourceEndpointDefinitions[elid]);
					tempEndpointParams.isSource = true;
					tempEndpointParams.anchor = [x,y,0,0];
					tempEndpointParams.dragOptions = dragOptions;
					
					ep = jsPlumb.addEndpoint(elid, tempEndpointParams);
					// we set this to prevent connections from firing attach events before this function has had a chance
					// to move the endpoint.
					ep.endpointWillMoveAfterConnection = p.parent != null;
					
					jpcl.bind(ep.canvas, "mouseup", function() {
						// this mouseup event seems to be fired only if no dragging occurred, which is handy (except i have
						// only tested jquery so far so lets not get too excited).  anyway, since no dragging has occurred,
						// we know we can safely just delete the endpoint we just created.
						jsPlumb.deleteEndpoint(ep);						
					});
					
					// and then trigger its mousedown event, which will kick off a drag, which will start dragging
					// a new connection from this endpoint.
					jpcl.trigger(ep.canvas, "mousedown", e);
					jpcl.trigger(document, "click", e);
				});												
			};
			
			el = _convertYUICollection(el);			
			
			var inputs = el.length && el.constructor != String ? el : [ el ];
						
			for (var i = 0; i < inputs.length; i++) {			
				_doOne(_getElementObject(inputs[i]));
			}
		};
		
		/**
		 * helper method to make a list of elements connection sources.
		 * @param els
		 * @param params
		 * @param referenceParams
		 * @return
		 */
		this.makeSources = function(els, params, referenceParams) {
			for ( var i = 0; i < els.length; i++) {
				_currentInstance.makeSource(els[i], params, referenceParams);				
			}
		};
		
		/*
		  Function: ready
		  Helper method to bind a function to jsPlumb's ready event.
		 */
		this.ready = function(fn) {
			_currentInstance.bind("ready", fn);
		},

		/*
		  Function: repaint 
		  Repaints an element and its connections. This method gets new sizes for the elements before painting anything.
		  
		  Parameters: 
		  	el - either the id of the element or a selector representing the element.
		  	 
		  Returns: 
		  	void
		  	 
		  See Also: 
		  	<repaintEverything>
		 */
		this.repaint = function(el) {
			var _processElement = function(el) { _draw(_getElementObject(el)); };
			// support both lists...
			if (typeof el == 'object')
				for ( var i = 0; i < el.length; i++) _processElement(el[i]);			 
			else // ...and single strings.
				_processElement(el);
		};

		/*
		  Function: repaintEverything 
		  Repaints all connections.
		   
		  Returns: 
		  	void
		  	
		  See Also: 
		  	<repaint>
		 */
		this.repaintEverything = function() {
			var timestamp = _timestamp();
			for ( var elId in endpointsByElement) {
				_draw(_getElementObject(elId), null, timestamp);
			}
		};

		/*
		  Function: removeAllEndpoints 
		  Removes all Endpoints associated with a given element. Also removes all Connections associated with each Endpoint it removes.
		  
		  Parameters: 
		  	el - either an element id, or a selector for an element.
		  	 
		  Returns: 
		  	void
		  	 
		  See Also: 
		  	<removeEndpoint>
		 */
		this.removeAllEndpoints = function(el) {
			var elId = _getAttribute(el, "id");
			var ebe = endpointsByElement[elId];
			if (ebe) {
				for ( var i = 0; i < ebe.length; i++) 
					_currentInstance.deleteEndpoint(ebe[i]);
			}
			endpointsByElement[elId] = [];
		};

		/*
		  Removes every Endpoint in this instance of jsPlumb.		   		  		  		  
		  @deprecated use deleteEveryEndpoint instead
		 */
		this.removeEveryEndpoint = this.deleteEveryEndpoint;
		
		/*
		  Removes the given Endpoint from the given element.		  		  
		  @deprecated Use jsPlumb.deleteEndpoint instead (and note you dont need to supply the element. it's irrelevant).
		 */
		this.removeEndpoint = function(el, endpoint) {
			_currentInstance.deleteEndpoint(endpoint);
		};

		/*
		  Function:reset 
		  Removes all endpoints and connections and clears the listener list. To keep listeners call jsPlumb.deleteEveryEndpoint instead of this.
		 */
		this.reset = function() {
			this.deleteEveryEndpoint();
			// contunous? or is it merged with the normal one?
			this.clearListeners();
			// reattach the anchor manager listeners
			this.bind("jsPlumbConnection", _currentInstance.anchorManager.connectionListener);
			this.bind("jsPlumbConnectionDetached", _currentInstance.anchorManager.connectionDetachedListener);	
		};

		/*
		  Function: setAutomaticRepaint 
		  Sets/unsets automatic repaint on window resize.
		   
		  Parameters: 
		  	value - whether or not to automatically repaint when the window is resized.
		  	 
		  Returns: void
		 */
		this.setAutomaticRepaint = function(value) {
			automaticRepaint = value;
		};

		/*
		 * Function: setDefaultScope 
		 * Sets the default scope for Connections and Endpoints. A scope defines a type of Endpoint/Connection; supplying a
		 * scope to an Endpoint or Connection allows you to support different
		 * types of Connections in the same UI.  If you're only interested in
		 * one type of Connection, you don't need to supply a scope. This method
		 * will probably be used by very few people; it just instructs jsPlumb
		 * to use a different key for the default scope.
		 * 
		 * Parameters:
		 * 	scope - scope to set as default.
		 */
		this.setDefaultScope = function(scope) {
			DEFAULT_SCOPE = scope;
		};

		/*
		 * Function: setDraggable 
		 * Sets whether or not a given element is
		 * draggable, regardless of what any jsPlumb command may request.
		 * 
		 * Parameters: 
		 * 	el - either the id for the element, or a selector representing the element.
		 *  
		 * Returns: 
		 * 	void
		 */
		this.setDraggable = _setDraggable;

		this.setDebugLog = function(debugLog) {
			log = debugLog;
		};

		/*
		 * Function: setRepaintFunction 
		 * 	Sets the function to fire when the window size has changed and a repaint was fired. 
		 * 
		 * Parameters: 
		 * 	f - Function to execute.
		 *  
		 * Returns: void
		 */
		this.setRepaintFunction = function(f) {
			repaintFunction = f;
		};
		
		/*
		 * Function: setMouseEventsEnabled
		 * Sets whether or not mouse events are enabled.  Default is true.
		 *  
		 * Parameters:
		 * 	enabled - whether or not mouse events should be enabled.
		 * 
		 * Returns: 
		 * 	void
		 */
		this.setMouseEventsEnabled = function(enabled) {
			_mouseEventsEnabled = enabled;
		};
		
		/*
		 * Constant for use with the setRenderMode method
		 */
		this.CANVAS = "canvas";
		
		/*
		 * Constant for use with the setRenderMode method
		 */
		this.SVG = "svg";
		
		this.VML = "vml";
		
		/*
		 * Function: setRenderMode
		 * Sets render mode: jsPlumb.CANVAS, jsPlumb.SVG or jsPlumb.VML.  jsPlumb will fall back to VML if it determines that
		 * what you asked for is not supported (and that VML is).  If you asked for VML but the browser does
		 * not support it, jsPlumb uses SVG.  
		 * 
		 * Returns:
		 * the render mode that jsPlumb set, which of course may be different from that requested.
		 */
		this.setRenderMode = function(mode) {
			if (mode) 
				mode = mode.toLowerCase();
			else 
				return;
			if (mode !== jsPlumb.CANVAS && mode !== jsPlumb.SVG && mode !== jsPlumb.VML) throw new Error("render mode must be one of jsPlumb.CANVAS, jsPlumb.SVG or jsPlumb.VML");
			// now test we actually have the capability to do this.
			if (mode === jsPlumb.CANVAS && canvasAvailable) 
				renderMode = jsPlumb.CANVAS;
			else if (mode === jsPlumb.SVG && svgAvailable)
				renderMode = jsPlumb.SVG;
			else if (vmlAvailable)
				renderMode = jsPlumb.VML;		
			
			return renderMode;
		};
		
		this.getRenderMode = function() { return renderMode; };

		/*
		 * Function: show 
		 * Sets an element's connections to be visible.
		 * 
		 * Parameters: 
		 * 	el - either the id of the element, or a selector for the element.
		 *  changeEndpoints - whether or not to also change the visible state of the endpoints on the element.  this also has a bearing on
		 *  other connections on those endpoints: if their other endpoint is also visible, the connections are made visible.  
		 *  
		 * Returns: 
		 * 	void
		 */
		this.show = function(el, changeEndpoints) {
			_setVisible(el, "block", changeEndpoints);
		};

		/*
		 * Function: sizeCanvas 
		 * Helper to size a canvas. You would typically use
		 * this when writing your own Connector or Endpoint implementation.
		 * 
		 * Parameters: 
		 * 	x - [int] x position for the Canvas origin 
		 * 	y - [int] y position for the Canvas origin 
		 * 	w - [int] width of the canvas 
		 * 	h - [int] height of the canvas
		 *  
		 * Returns: 
		 * 	void
		 */
		this.sizeCanvas = function(canvas, x, y, w, h) {
			if (canvas) {
				canvas.style.height = h + "px";
				canvas.height = h;
				canvas.style.width = w + "px";
				canvas.width = w;
				canvas.style.left = x + "px";
				canvas.style.top = y + "px";
			}
		};

		/**
		 * gets some test hooks. nothing writable.
		 */
		this.getTestHarness = function() {
			return {
				endpointsByElement : endpointsByElement,  
				endpointCount : function(elId) {
					var e = endpointsByElement[elId];
					return e ? e.length : 0;
				},
				connectionCount : function(scope) {
					scope = scope || DEFAULT_SCOPE;
					var c = connectionsByScope[scope];
					return c ? c.length : 0;
				},
				findIndex : _findIndex,
				getId : _getId,
				makeAnchor:self.makeAnchor,
				makeDynamicAnchor:self.makeDynamicAnchor
			};
		};

		/**
		 * Toggles visibility of an element's connections. kept for backwards
		 * compatibility
		 */
		this.toggle = _toggleVisible;

		/*
		 * Function: toggleVisible 
		 * Toggles visibility of an element's Connections.
		 *  
		 * Parameters: 
		 * 	el - either the element's id, or a selector representing the element.
		 *  changeEndpoints - whether or not to also toggle the endpoints on the element.
		 *  
		 * Returns: 
		 * 	void, but should be updated to return the current state
		 */
		// TODO: update this method to return the current state.
		this.toggleVisible = _toggleVisible;

		/*
		 * Function: toggleDraggable 
		 * Toggles draggability (sic?) of an element's Connections.
		 *  
		 * Parameters: 
		 * 	el - either the element's id, or a selector representing the element.
		 *  
		 * Returns: 
		 * 	The current draggable state.
		 */
		this.toggleDraggable = _toggleDraggable;

		/*
		 * Function: unload 
		 * Unloads jsPlumb, deleting all storage. You should call this from an onunload attribute on the <body> element. 
		 * 
		 * Returns:
		 * 	void
		 */
		this.unload = function() {
			delete endpointsByElement;
			delete endpointsByUUID;
			delete offsets;
			delete sizes;
			delete floatingConnections;
			delete draggableStates;
			delete canvasList;
		};

		/*
		 * Helper method to wrap an existing function with one of
		 * your own. This is used by the various implementations to wrap event
		 * callbacks for drag/drop etc; it allows jsPlumb to be transparent in
		 * its handling of these things. If a user supplies their own event
		 * callback, for anything, it will always be called. 
		 */
		this.wrap = _wrap;			
		this.addListener = this.bind;
		
		var adjustForParentOffsetAndScroll = function(xy, el) {
			var offsetParent = null, result = xy;
			if (el.tagName.toLowerCase() === "svg" && el.parentNode) {
				offsetParent = el.parentNode;
			}
			else if (el.offsetParent) {
				offsetParent = el.offsetParent;					
			}
			if (offsetParent != null) {
				var po = offsetParent.tagName.toLowerCase() === "body" ? {left:0,top:0} : _getOffset(offsetParent),
					so = offsetParent.tagName.toLowerCase() === "body" ? {left:0,top:0} : {left:offsetParent.scrollLeft, top:offsetParent.scrollTop};					
						
				// i thought it might be cool to do this:
				//	lastReturnValue[0] = lastReturnValue[0] - offsetParent.offsetLeft + offsetParent.scrollLeft;
				//	lastReturnValue[1] = lastReturnValue[1] - offsetParent.offsetTop + offsetParent.scrollTop;					
				// but i think it ignores margins.  my reasoning was that it's quicker to not hand off to some underlying					
				// library.
				
				result[0] = xy[0] - po.left + so.left;
				result[1] = xy[1] - po.top + so.top;
			}
		
			return result;
		};

		/**
		 * Anchors model a position on some element at which an Endpoint may be located.  They began as a first class citizen of jsPlumb, ie. a user
		 * was required to create these themselves, but over time this has been replaced by the concept of referring to them either by name (eg. "TopMiddle"),
		 * or by an array describing their coordinates (eg. [ 0, 0.5, 0, -1 ], which is the same as "TopMiddle").  jsPlumb now handles all of the
		 * creation of Anchors without user intervention.
		 */
		var Anchor = function(params) {
			var self = this;
			this.x = params.x || 0;
			this.y = params.y || 0;
			this.elementId = params.elementId;
			var orientation = params.orientation || [ 0, 0 ];
			var lastTimestamp = null, lastReturnValue = null;
			this.offsets = params.offsets || [ 0, 0 ];
			self.timestamp = null;
			this.compute = function(params) {
				var xy = params.xy, wh = params.wh, element = params.element, timestamp = params.timestamp;
				
				if (timestamp && timestamp === self.timestamp) {
//					console.count("already computed anchor");
					return lastReturnValue;
				}
//				else
//					console.count("recomputed anchor");
	
	lastReturnValue = [ xy[0] + (self.x * wh[0]) + self.offsets[0], xy[1] + (self.y * wh[1]) + self.offsets[1] ];
				
				// adjust loc if there is an offsetParent
				lastReturnValue = adjustForParentOffsetAndScroll(lastReturnValue, element.canvas);
				
				self.timestamp = timestamp;
				return lastReturnValue;
			};

			this.getOrientation = function() { return orientation; };

			this.equals = function(anchor) {
				if (!anchor) return false;
				var ao = anchor.getOrientation();
				var o = this.getOrientation();
				return this.x == anchor.x && this.y == anchor.y
						&& this.offsets[0] == anchor.offsets[0]
						&& this.offsets[1] == anchor.offsets[1]
						&& o[0] == ao[0] && o[1] == ao[1];
			};

			this.getCurrentLocation = function() { return lastReturnValue; };
		};

		/**
		 * An Anchor that floats. its orientation is computed dynamically from
		 * its position relative to the anchor it is floating relative to.  It is used when creating 
		 * a connection through drag and drop.
		 * 
		 * TODO FloatingAnchor could totally be refactored to extend Anchor just slightly.
		 */
		var FloatingAnchor = function(params) {

			// this is the anchor that this floating anchor is referenced to for
			// purposes of calculating the orientation.
			var ref = params.reference,
			// the canvas this refers to.
			refCanvas = params.referenceCanvas,
			size = _getSize(_getElementObject(refCanvas)),

			// these are used to store the current relative position of our
			// anchor wrt the reference anchor. they only indicate
			// direction, so have a value of 1 or -1 (or, very rarely, 0). these
			// values are written by the compute method, and read
			// by the getOrientation method.
			xDir = 0, yDir = 0,
			// temporary member used to store an orientation when the floating
			// anchor is hovering over another anchor.
			orientation = null,
			_lastResult = null;

			this.compute = function(params) {
				var xy = params.xy, element = params.element,
				result = [ xy[0] + (size[0] / 2), xy[1] + (size[1] / 2) ]; // return origin of the element. we may wish to improve this so that any object can be the drag proxy.
							
				// adjust loc if there is an offsetParent
				result = adjustForParentOffsetAndScroll(result, element.canvas);
				
				_lastResult = result;
				return result;
			};

			this.getOrientation = function() {
				if (orientation) return orientation;
				else {
					var o = ref.getOrientation();
					// here we take into account the orientation of the other
					// anchor: if it declares zero for some direction, we declare zero too. this might not be the most awesome. perhaps we can come
					// up with a better way. it's just so that the line we draw looks like it makes sense. maybe this wont make sense.
					return [ Math.abs(o[0]) * xDir * -1,
							Math.abs(o[1]) * yDir * -1 ];
				}
			};

			/**
			 * notification the endpoint associated with this anchor is hovering
			 * over another anchor; we want to assume that anchor's orientation
			 * for the duration of the hover.
			 */
			this.over = function(anchor) { orientation = anchor.getOrientation(); };

			/**
			 * notification the endpoint associated with this anchor is no
			 * longer hovering over another anchor; we should resume calculating
			 * orientation as we normally do.
			 */
			this.out = function() { orientation = null; };

			this.getCurrentLocation = function() { return _lastResult; };
		};

		/* 
		 * A DynamicAnchor is an Anchor that contains a list of other Anchors, which it cycles
		 * through at compute time to find the one that is located closest to
		 * the center of the target element, and returns that Anchor's compute
		 * method result. this causes endpoints to follow each other with
		 * respect to the orientation of their target elements, which is a useful
		 * feature for some applications.
		 * 
		 */
		var DynamicAnchor = function(anchors, anchorSelector, elementId) {
			this.isSelective = true;
			this.isDynamic = true;			
			var _anchors = [],
			_convert = function(anchor) { return anchor.constructor == Anchor ? anchor: jsPlumb.makeAnchor(anchor, elementId, _currentInstance); };
			for (var i = 0; i < anchors.length; i++) _anchors[i] = _convert(anchors[i]);			
			this.addAnchor = function(anchor) { _anchors.push(_convert(anchor)); };
			this.getAnchors = function() { return _anchors; };
			this.locked = false;
			var _curAnchor = _anchors.length > 0 ? _anchors[0] : null,
				_curIndex = _anchors.length > 0 ? 0 : -1,
				self = this,
			
				// helper method to calculate the distance between the centers of the two elements.
				_distance = function(anchor, cx, cy, xy, wh) {
					var ax = xy[0] + (anchor.x * wh[0]), ay = xy[1] + (anchor.y * wh[1]);
					return Math.sqrt(Math.pow(cx - ax, 2) + Math.pow(cy - ay, 2));
				},
			
			// default method uses distance between element centers.  you can provide your own method in the dynamic anchor
			// constructor (and also to jsPlumb.makeDynamicAnchor). the arguments to it are four arrays: 
			// xy - xy loc of the anchor's element
			// wh - anchor's element's dimensions
			// txy - xy loc of the element of the other anchor in the connection
			// twh - dimensions of the element of the other anchor in the connection.
			// anchors - the list of selectable anchors
			_anchorSelector = anchorSelector || function(xy, wh, txy, twh, anchors) {
				var cx = txy[0] + (twh[0] / 2), cy = txy[1] + (twh[1] / 2);
				var minIdx = -1, minDist = Infinity;
				for ( var i = 0; i < anchors.length; i++) {
					var d = _distance(anchors[i], cx, cy, xy, wh);
					if (d < minDist) {
						minIdx = i + 0;
						minDist = d;
					}
				}
				return anchors[minIdx];
			};
			
			this.compute = function(params) {				
				var xy = params.xy, wh = params.wh, timestamp = params.timestamp, txy = params.txy, twh = params.twh;				
				// if anchor is locked or an opposite element was not given, we
				// maintain our state. anchor will be locked
				// if it is the source of a drag and drop.
				if (self.locked || txy == null || twh == null)
					return _curAnchor.compute(params);
				else
					params.timestamp = null; // otherwise clear this, i think. we want the anchor to compute.
				
				_curAnchor = _anchorSelector(xy, wh, txy, twh, _anchors);
				
				return _curAnchor.compute(params);
			};

			this.getCurrentLocation = function() {
				return _curAnchor != null ? _curAnchor.getCurrentLocation() : null;
			};

			this.getOrientation = function() { return _curAnchor != null ? _curAnchor.getOrientation() : [ 0, 0 ]; };
			this.over = function(anchor) { if (_curAnchor != null) _curAnchor.over(anchor); };
			this.out = function() { if (_curAnchor != null) _curAnchor.out(); };
		};
		
	var AnchorManager = function() {
		var _amEndpoints = {},
			dynamicAnchorConnectionsByElementId = {},  // for each element id, a list of connections 
														// for which the other end of the connection is 
														// a dynamic endpoint.
			standardAnchorConnectionsByElementId = {},			
			continuousAnchorConnectionsByElementId = {},
			continuousAnchorEndpoints = [],
			self = this;
			
 		this.connectionListener = function(conn) {
			var sourceId = conn.sourceId, targetId = conn.targetId,
				sourceAnchor = conn.connection.endpoints[0].anchor,
				targetAnchor = conn.connection.endpoints[1].anchor,
				sourceEndpoint = conn.sourceEndpoint,
				targetEndpoint = conn.targetEndpoint,
			    registerConnection = function(otherIndex, otherEndpoint, otherAnchor, elId, c) {
					if (otherAnchor.constructor == DynamicAnchor) {
						_addToList(dynamicAnchorConnectionsByElementId, elId, [c, otherEndpoint]);
					}
					else if (otherAnchor.constructor == Anchor)
						_addToList(standardAnchorConnectionsByElementId, elId, c);
					else {
						// continuous.
						_addToList(continuousAnchorConnectionsByElementId, elId, c);
					}
			    };
			registerConnection(1, targetEndpoint, targetAnchor, sourceId, conn.connection);	
			registerConnection(0, sourceEndpoint, sourceAnchor, targetId, conn.connection);				
		};
		this.connectionDetachedListener = function(conn) {
			var sourceId = conn.sourceId, targetId = conn.targetId,
				sourceAnchor = conn.connection.endpoints[0].anchor,
				targetAnchor = conn.connection.endpoints[1].anchor,
				sourceEndpoint = conn.sourceEndpoint,
				targetEndpoint = conn.targetEndpoint,
				removeConnection = function(otherIndex, otherEndpoint, otherAnchor, elId, c) {
					if (otherAnchor.constructor == FloatingAnchor) {
						// no-op
					}
					else if (otherAnchor.constructor == DynamicAnchor) {
						_removeFromList(dynamicAnchorConnectionsByElementId, elId, [c, otherEndpoint]);
					}
					else if (otherAnchor.constructor == Anchor)
						_removeFromList(standardAnchorConnectionsByElementId, elId, c);
					else {
						// continuous.
						_removeFromList(continuousAnchorConnectionsByElementId, elId, c);
					}				
				};
				
			removeConnection(1, targetEndpoint, targetAnchor, sourceId, conn.connection);	
			removeConnection(0, sourceEndpoint, sourceAnchor, targetId, conn.connection);									
		};
		this.add = function(endpoint, elementId) {
			if (!endpoint.anchor.isContinuous)
				_addToList(_amEndpoints, elementId, endpoint);	
			else 
				continuousAnchorEndpoints.push(endpoint);
		};
		this.get = function(elementId) {
			return {
				"standard":standardAnchorConnectionsByElementId[elementId] || [],
				"dynamic":dynamicAnchorConnectionsByElementId[elementId] || [],
				"continuous":continuousAnchorConnectionsByElementId[elementId] || [],
				"endpoints":_amEndpoints[elementId],
				"continuousAnchorEndpoints":continuousAnchorEndpoints
			};
		};
		this.deleteEndpoint = function(endpoint) {
			var cIdx = _findIndex(continuousAnchorEndpoints, endpoint);
			if (cIdx > -1)
				continuousAnchorEndpoints.splice(cIdx, 1);
			else
				_removeFromList(_amEndpoints, endpoint.elementId, endpoint);		
		};
		this.clearFor = function(elementId) {
			delete _amEndpoints[elementId];
			_amEndpoints[elementId] = [];
		};
		this.redraw = function(elementId, ui, timestamp) {
			// get all the endpoints for this element
			var ep = _amEndpoints[elementId] || [],
				dynamicAnchorConnections = dynamicAnchorConnectionsByElementId[elementId] || [],
				standardAnchorConnections = standardAnchorConnectionsByElementId[elementId] || [],
				continuousAnchorConnections = continuousAnchorConnectionsByElementId[elementId] || [];
			timestamp = timestamp || _timestamp();
				
			_updateOffset( { elId : elementId, offset : ui, recalc : false, timestamp : timestamp }); 
			// valid for one paint cycle.
			var myOffset = offsets[elementId], myWH = sizes[elementId], connectionsToPaint = [];
			// first paint all the endpoints for this element
			for (var i = 0; i < ep.length; i++) {				
				ep[i].paint( { timestamp : timestamp, offset : myOffset, dimensions : myWH });
				/*if (ep[i].anchor.isFloating) {
					for (var j = 0; j < ep[i].connections.length; j++)
						//floatingConnections[floatingConnections.length] = ep[i].connections[j];
						ep[i].connections[j].paint({timestamp:timestamp, recalc:false});
				}*/
			}
			// then paint all the "standard connections", which are connections whose other anchor is
			// static and therefore does not need to be recomputed.
			for (var i = 0; i < standardAnchorConnections.length; i++) {
				standardAnchorConnections[i].paint({timestamp:timestamp, recalc:false});
			}
			
			// then paint all the "dynamic connections", which are connections whose other anchor is
			// static and therefore does need to be recomputed; we make sure that happens only one time.
			for (var i = 0; i < dynamicAnchorConnections.length; i++) {
				var otherEndpoint = dynamicAnchorConnections[i][1];
				_updateOffset( { elId : otherEndpoint.elementId, timestamp : timestamp }); 							
				otherEndpoint.paint({ elementWithPrecedence:elementId });
				dynamicAnchorConnections[i][0].paint({timestamp:timestamp, recalc:false});
				// all the connections for the other endpoint now need to be repainted
				for (var k = 0; k < otherEndpoint.connections.length; k++) {
					if (otherEndpoint.connections[k] !== dynamicAnchorConnections[i][0])
					otherEndpoint.connections[k].paint( { elId : elementId, ui : ui, recalc : false, timestamp : timestamp }); 
				}
			}
			// paint current floating connection for this element, if there is one.
			var fc = floatingConnections[elementId];
			if (fc) 
				fc.paint({timestamp:timestamp, recalc:false});
			
			// and lastly, have the continuous anchor manager repaint itself.
			if (continuousAnchorConnections.length > 0) {
				_currentInstance.continuousAnchorManager.recalc(timestamp);
				// and draw all the endpoints
				for (var i = 0; i < continuousAnchorEndpoints.length; i++)
					continuousAnchorEndpoints[i].paint({timestamp:timestamp, recalc:false});
			}			
		};
		this.rehomeEndpoint = function(currentId, element) {
//*
			var eps = _amEndpoints[currentId] || [], //, 
				elementId = _currentInstance.getId(element);
			for (var i = 0; i < eps.length; i++) {
				self.add(eps[i], elementId);
			}
			eps.splice(0, eps.length);
//*/			
		};
	};
	_currentInstance.anchorManager = new AnchorManager();
	_currentInstance.bind("jsPlumbConnection", _currentInstance.anchorManager.connectionListener);
	_currentInstance.bind("jsPlumbConnectionDetached", _currentInstance.anchorManager.connectionDetachedListener);	
				
	// "continous" anchors: anchors that pick their location based on how many connections the given element has.
	// this requires looking at a lot more elements than normal - anything that has had a Continuous anchor applied has
	// to be recalculated.  so this manager is used as a reference point.  the first time, with a new timestamp, that
	// a continuous anchor is asked to compute, it calls this guy.  or maybe, even, this guy gets called somewhere else
	// and compute only ever returns pre-computed values.  either way, this is the central point, and we want it to
	// be called as few times as possible.  
	var continuousAnchors = {}, lastContinuousAnchorsTimestamp = null, continuousAnchorLocations = {},
	continuousAnchorOrientations = {}, continuousAnchorConnections = {},
	Orientation = { HORIZONTAL : "horizontal", VERTICAL : "vertical", DIAGONAL : "diagonal", IDENTITY:"identity" },
	// TODO this functions uses a crude method of determining orientation between two elements.		
	// 'diagonal' should be chosen when the angle of the line between the two centers is around
	// one of 45, 135, 225 and 315 degrees. maybe +- 15 degrees.
	calculateOrientation = function(sourceId, targetId, o1, wh, o2, twh) {
		
		if (sourceId === targetId) return {
			orientation:Orientation.IDENTITY,
			a:["top", "top"]
		};
		
		var o1w = wh[0], o1h = wh[1], o2w = twh[0], o2h = twh[1],
		center1 = [ (o1.left + o1.right) / 2, (o1.top + o1.bottom) / 2],
		center2 = [ (o2.left + o2.right) / 2, (o2.top + o2.bottom) / 2],
		theta = Math.atan2((center2[1] - center1[1]) , (center2[0] - center1[0])),	
		theta2 = Math.atan2((center1[1] - center2[1]) , (center1[0] - center2[0])),
		h = ((o1.left <= o2.left && o1.right >= o2.left) || (o1.left <= o2.right && o1.right >= o2.right) ||
			(o1.left <= o2.left && o1.right >= o2.right) || (o2.left <= o1.left && o2.right >= o1.right)),
		v = ((o1.top <= o2.top && o1.bottom >= o2.top) || (o1.top <= o2.bottom && o1.bottom >= o2.bottom) ||
			(o1.top <= o2.top && o1.bottom >= o2.bottom) || (o2.top <= o1.top && o2.bottom >= o1.bottom));
					
		if (! (h || v)) {
			var a = null, rls = false, rrs = false, sortValue = null;
			if (o2.left > o1.left && o2.top > o1.top)
				a = ["right", "top"];
			else if (o2.left > o1.left && o1.top > o2.top)
				a = [ "top", "left"];
			else if (o2.left < o1.left && o2.top < o1.top)
				a = [ "top", "right"];
			else if (o2.left < o1.left && o2.top > o1.top)
				a = ["left", "top" ];
						
			return { orientation:Orientation.DIAGONAL, a:a, theta:theta, theta2:theta2 };
		}
		else if (h) return {
			orientation:Orientation.HORIZONTAL,
			a:o1.top < o2.top ? ["bottom", "top"] : ["top", "bottom"],
			theta:theta, theta2:theta2
		}
		else return {
			orientation:Orientation.VERTICAL,
			a:o1.left < o2.left ? ["right", "left"] : ["left", "right"],
			theta:theta, theta2:theta2
		}					
	},
	placeAnchorsOnLine = function(desc, elementDimensions, elementPosition, 
					connections, horizontal, otherMultiplier, reverse) {
		var a = [], step = elementDimensions[horizontal ? 0 : 1] / (connections.length + 1);
						
		for (var i = 0; i < connections.length; i++) {
			var val = (i + 1) * step, other = otherMultiplier * elementDimensions[horizontal ? 1 : 0];
			if (reverse)
			  val = elementDimensions[horizontal ? 0 : 1] - val;
					
			var dx = (horizontal ? val : other), x = elementPosition[0] + dx,  xp = dx / elementDimensions[0],
			 	dy = (horizontal ? other : val), y = elementPosition[1] + dy, yp = dy / elementDimensions[1];
					
			a.push([ x, y, xp, yp, connections[i][1], connections[i][2] ]);
		}
					
		return a;
	},
	standardEdgeSort = function(a, b) { return a > b; },
	reverseEdgeSort = function(a, b) { return a < b; },
	currySort2 = function(reverseAngles) {
		return function(a,b) {
			if (reverseAngles) {
				if (a[0][0] < b[0][0]) 
					return true;
				else 
					return a[0][1] > b[0][1];
			}
			else {
				if (a[0][0] > b[0][0]) 
					return true;
				else 
					return a[0][1] > b[0][1];
			}
		};
	},
	leftSort = function(a,b) {
		// first get adjusted values
		var p1 = a[0][0] < 0 ? -Math.PI - a[0][0] : Math.PI - a[0][0],
		p2 = b[0][0] < 0 ? -Math.PI - b[0][0] : Math.PI - b[0][0];
		if (p1 > p2) return true;
		else return a[0][1] > b[0][1];
	},
	edgeSortFunctions = {
		"top":standardEdgeSort,
		"right":currySort2(true),
		"bottom":currySort2(true),//standardEdgeSort,
		"left":leftSort//standardEdgeSort
	},
	placeAnchors = function(elementId, anchorLists) {
		var sS = sizes[elementId], sO = offsets[elementId],
		placeSomeAnchors = function(desc, elementDimensions, elementPosition, unsortedConnections, isHorizontal, otherMultiplier) {
			var sc = unsortedConnections.sort(edgeSortFunctions[desc]), // puts them in order based on the target element's pos on screen
				reverse = desc === "right" || desc === "top",
				anchors = placeAnchorsOnLine(desc, elementDimensions, 
											 elementPosition, sc, 
											 isHorizontal, otherMultiplier, reverse );		
				
			// takes a computed anchor position and adjusts it for parent offset and scroll, then stores it.	
			var _setAnchorLocation = function(endpoint, anchorPos) {
				var a = adjustForParentOffsetAndScroll([anchorPos[0], anchorPos[1]], endpoint.canvas);
				continuousAnchorLocations[endpoint.id] = [ a[0], a[1], anchorPos[2], anchorPos[3] ];
			};
				
			for (var i = 0; i < anchors.length; i++) {
				var c = anchors[i][4], weAreSource = c.endpoints[0].elementId === elementId, weAreTarget = c.endpoints[1].elementId === elementId;
				
				if (weAreSource && weAreTarget) {
					// handle this in a special way. basically we will populate the source one if it is not yet
					// populated, or the target one otherwise.  i guess here is where we would able to setup the anchors in
					// such a way that the connection could go anticlockwise or clockwise - need to keep that in mind.
					if (!continuousAnchorLocations[c.endpoints[0].id])
						_setAnchorLocation(c.endpoints[0], anchors[i]);
					else
						_setAnchorLocation(c.endpoints[1], anchors[i]);
				}
				else if (weAreSource)
					_setAnchorLocation(c.endpoints[0], anchors[i]);
				else if (weAreTarget)
					_setAnchorLocation(c.endpoints[1], anchors[i]);
			}
		};
				
		placeSomeAnchors("bottom", sS, [sO.left,sO.top], anchorLists.bottom, true, 1);
		placeSomeAnchors("top", sS, [sO.left,sO.top], anchorLists.top, true, 0);
		placeSomeAnchors("left", sS, [sO.left,sO.top], anchorLists.left, false, 0);
		placeSomeAnchors("right", sS, [sO.left,sO.top], anchorLists.right, false, 1);				
	},
	continuousAnchorManager = {
		get:function(params) {
			var existing = continuousAnchors[params.elementId];
			if (!existing) {
				existing = {
					type:"Continuous",
					compute : function(params) {
						if (params.timestamp != lastContinuousAnchorsTimestamp)
							continuousAnchorManager.recalc(params.timestamp, params.elementId, params._jsPlumb);
						return continuousAnchorLocations[params.element.id] || [0,0];
					},
					getCurrentLocation : function(endpoint) {
						return continuousAnchorLocations[endpoint.id] || [0,0];
					},
					getOrientation : function(endpoint) {
						return continuousAnchorOrientations[endpoint.id] || [0,0];
					},
					isDynamic : true,
					isContinuous : true
				};
				continuousAnchors[params.elementId] = existing;
			}
			return existing;
		},
		recalc:function(timestamp) {
		
			_group("RECALC");
			_time("RECALC");
		
			lastContinuousAnchorsTimestamp = timestamp;
			// caches of elements we've processed already.
			var anchorLists = {}, sourceConns = {}, targetConns = {}, connectionsToRepaint = [];
			var sd = new Date().getTime();
			_time("calculating anchors");							
			// TODO this should be merged with the other anchor manager; it should not be necessary to be asking 
			// jsPlumb for the connections at this point. we already know, for each element id, the list of
			// connections that have a continuous anchor at one or more ends.
			for (var anElement in continuousAnchors) {
				// get all source connections for this element
				var sourceConns = _currentInstance.getConnections({source:anElement});
				if (!anchorLists[anElement]) anchorLists[anElement] = { top:[], right:[], bottom:[], left:[] };
				for (var i = 0; i < sourceConns.length; i++) {
					if (sourceConns[i].endpoints[0].anchor.type === "Continuous") {
						connectionsToRepaint.push(sourceConns[i]); 
						// calculate orientation to target
						// check if target is Continuous too, and give it values if so.
						var targetId = sourceConns[i].targetId, sO = offsets[anElement], 
							tO = offsets[targetId], sS = sizes[anElement], tS = sizes[targetId];
						if (!anchorLists[targetId]) anchorLists[targetId] = { top:[], right:[], bottom:[], left:[] };						
						sO.right = sO.left + sS[0], sO.bottom = sO.top + sS[1], tO.right = tO.left + tS[0], tO.bottom = tO.top + tS[1];
						// find the orientation between the two elements
						var o = calculateOrientation(anElement, targetId, sO, sS, tO, tS),
							edgeList = anchorLists[anElement][o.a[0]],
							otherEdgeList = anchorLists[targetId][o.a[1]];
						edgeList.push([ [ o.theta, 0 ], sourceConns[i], false, targetId ]);				//here we push a sort value (soon to be replaced), the connection, and whether or not this is the source
						// target connections need to be inserted in the opposite order
						var tIdx = otherEdgeList.find(function(f) { return f[3] == anElement; });
						if (tIdx == -1) tIdx = otherEdgeList.length;
						otherEdgeList.splice(tIdx, 0, [ [ o.theta2, -1 ], sourceConns[i], true, anElement ]);
					}
				}
			}
			
			_timeEnd("calculating anchors");										

			_time("place anchors");				
			// now place anchors
			for (var anElement in continuousAnchors) {
				placeAnchors(anElement, anchorLists[anElement]);
			}

			_timeEnd("place anchors");
			
			_time("repaint other connections");
			// and now repaint all connections that we need to
			// TODO only repaint the ones whose anchors have moved.  how to determine this though?
			for (var i = 0; i < connectionsToRepaint.length; i++)
				connectionsToRepaint[i].repaint({timestamp:timestamp});			
		
			_timeEnd("repaint other connections");				
			
			_timeEnd("RECALC");
			_groupEnd("RECALC");						
		},
		connectionEvent : function(conn) {
			// keep a record of connections locally; we dont have to go off and ask jsPlumb every time
			// for the current connection list.  i thought this would be faster but it does not seem to have been 
			// overly effective.
			if (conn.sourceEndpoint.anchor.type === "Continuous") {
				_addToList(continuousAnchorConnections, conn.sourceEndpoint.elementId, conn.connection);
			}
		},
		connectionDetachedEvent : function(conn) {
			if (conn.sourceEndpoint.anchor.type === "Continuous") {
				_removeFromList(continuousAnchorConnections, conn.sourceEndpoint.elementId, conn.connection);
				continuousAnchorManager.recalc(_timestamp(), conn.sourceEndpoint.elementId, _currentInstance);
			}		
		}
		
	};
	_currentInstance.continuousAnchorManager = continuousAnchorManager;
	_currentInstance.bind("jsPlumbConnection", continuousAnchorManager.connectionEvent);
	_currentInstance.bind("jsPlumbConnectionDetached", continuousAnchorManager.connectionDetachedEvent);

		/*
		 * Class: Connection
		 * The connecting line between two Endpoints.
		 */
		/*
		 * Function: Connection
		 * Connection constructor.
		 * 
		 * Parameters:
		 * 	source 	- either an element id, a selector for an element, or an Endpoint.
		 * 	target	- either an element id, a selector for an element, or an Endpoint
		 * 	scope	- scope descriptor for this connection. optional.
		 *  container - optional id or selector instructing jsPlumb where to attach all the elements it creates for this connection.  you should read the documentation for a full discussion of this.
		 *  endpoint - Optional. Endpoint definition to use for both ends of the connection.
		 *  endpoints - Optional. Array of two Endpoint definitions, one for each end of the Connection. This and 'endpoint' are mutually exclusive parameters.
		 *  endpointStyle - Optional. Endpoint style definition to use for both ends of the Connection.
		 *  endpointStyles - Optional. Array of two Endpoint style definitions, one for each end of the Connection. This and 'endpoint' are mutually exclusive parameters.
		 *  paintStyle - Parameters defining the appearance of the Connection. Optional; jsPlumb will use the defaults if you supply nothing here.
		 *  hoverPaintStyle - Parameters defining the appearance of the Connection when the mouse is hovering over it. Optional; jsPlumb will use the defaults if you supply nothing here (note that the default hoverPaintStyle is null).
		 *  overlays - Optional array of Overlay definitions to appear on this Connection.
		 *  drawEndpoints - if false, instructs jsPlumb to not draw the endpoints for this Connection.  Be careful with this: it only really works when you tell jsPlumb to attach elements to the document body. Read the documentation for a full discussion of this. 
		 */
		var Connection = function(params) {
			var self = this, visible = true;
			self.idPrefix = "_jsplumb_c_";
			jsPlumbUIComponent.apply(this, arguments);
			// ************** get the source and target and register the connection. *******************
			
			/**
				Function:isVisible
				Returns whether or not the Connection is currently visible.
			*/
			this.isVisible = function() { return visible; };
			/**
				Function: setVisible
				Sets whether or not the Connection should be visible.

				Parameters:
					visible - boolean indicating desired visible state.
			*/
			this.setVisible = function(v) {
				visible = v;
				if (self.connector && self.connector.canvas) self.connector.canvas.style.display = v ? "block" : "none";
			};
			this.parent = params.parent;
			/**
				Property: source
				The source element for this Connection.
			*/
			this.source = _getElementObject(params.source);
			/**
				Property:target
				The target element for this Connection.
			*/
			this.target = _getElementObject(params.target);
			// sourceEndpoint and targetEndpoint override source/target, if they are present.
			if (params.sourceEndpoint) this.source = params.sourceEndpoint.getElement();
			if (params.targetEndpoint) this.target = params.targetEndpoint.getElement();
			/*
			 * Property: sourceId
			 * Id of the source element in the connection.
			 */
			this.sourceId = _getAttribute(this.source, "id");
			/*
			 * Property: targetId
			 * Id of the target element in the connection.
			 */
			this.targetId = _getAttribute(this.target, "id");
			
			/**
			 * implementation of abstract method in EventGenerator
			 * @return list of attached elements. in our case, a list of Endpoints.
			 */
			this.getAttachedElements = function() {
				return self.endpoints;
			};
			
			/*
			 * Property: scope
			 * Optional scope descriptor for the connection.
			 */
			this.scope = params.scope; // scope may have been passed in to the connect call. if it wasn't, we will pull it from the source endpoint, after having initialised the endpoints. 
			/*
			 * Property: endpoints
			 * Array of [source, target] Endpoint objects.
			 */
			this.endpoints = [];
			this.endpointStyles = [];
			// wrapped the main function to return null if no input given. this lets us cascade defaults properly.
			var _makeAnchor = function(anchorParams, elementId) {
				if (anchorParams)
					return jsPlumb.makeAnchor(anchorParams, elementId, _currentInstance);
			},
			prepareEndpoint = function(existing, index, params, element, elementId, connectorPaintStyle, connectorHoverPaintStyle) {
				if (existing) {
					self.endpoints[index] = existing;
					existing.addConnection(self);
				} else {
					if (!params.endpoints) params.endpoints = [ null, null ];
					var ep = params.endpoints[index] 
					        || params.endpoint
							|| _currentInstance.Defaults.Endpoints[index]
							|| jsPlumb.Defaults.Endpoints[index]
							|| _currentInstance.Defaults.Endpoint
							|| jsPlumb.Defaults.Endpoint;

					if (!params.endpointStyles) params.endpointStyles = [ null, null ];
					if (!params.endpointHoverStyles) params.endpointHoverStyles = [ null, null ];
					var es = params.endpointStyles[index] || params.endpointStyle || _currentInstance.Defaults.EndpointStyles[index] || jsPlumb.Defaults.EndpointStyles[index] || _currentInstance.Defaults.EndpointStyle || jsPlumb.Defaults.EndpointStyle;
					// Endpoints derive their fillStyle from the connector's strokeStyle, if no fillStyle was specified.
					if (es.fillStyle == null && connectorPaintStyle != null)
						es.fillStyle = connectorPaintStyle.strokeStyle;
					
					// TODO: decide if the endpoint should derive the connection's outline width and color.  currently it does:
					//*
					if (es.outlineColor == null && connectorPaintStyle != null) 
						es.outlineColor = connectorPaintStyle.outlineColor;
					if (es.outlineWidth == null && connectorPaintStyle != null) 
						es.outlineWidth = connectorPaintStyle.outlineWidth;
					//*/
					
					var ehs = params.endpointHoverStyles[index] || params.endpointHoverStyle || _currentInstance.Defaults.EndpointHoverStyles[index] || jsPlumb.Defaults.EndpointHoverStyles[index] || _currentInstance.Defaults.EndpointHoverStyle || jsPlumb.Defaults.EndpointHoverStyle;
					// endpoint hover fill style is derived from connector's hover stroke style.  TODO: do we want to do this by default? for sure?
					if (connectorHoverPaintStyle != null) {
						if (ehs == null) ehs = {};
						if (ehs.fillStyle == null) {
							ehs.fillStyle = connectorHoverPaintStyle.strokeStyle;
						}
					}
					var a = params.anchors ? params.anchors[index] : 
						params.anchor ? params.anchor :
						_makeAnchor(_currentInstance.Defaults.Anchors[index], elementId) || 
						_makeAnchor(jsPlumb.Defaults.Anchors[index], elementId) || 
						_makeAnchor(_currentInstance.Defaults.Anchor, elementId) || 
						_makeAnchor(jsPlumb.Defaults.Anchor, elementId),					
					u = params.uuids ? params.uuids[index] : null,
					e = _newEndpoint({ 
						paintStyle : es, 
						hoverPaintStyle:ehs, 
						endpoint : ep, 
						connections : [ self ], 
						uuid : u, 
						anchor : a, 
						source : element,
						container:params.container
					});
					self.endpoints[index] = e;
					
					
					if (params.drawEndpoints === false) e.setVisible(false, true, true);
					
					return e;
				}
			};					

			var eS = prepareEndpoint(params.sourceEndpoint, 0, params, self.source, self.sourceId, params.paintStyle, params.hoverPaintStyle);
			if (eS) _addToList(endpointsByElement, this.sourceId, eS);
			
			// if there were no endpoints supplied and the source element is the target element, we will reuse the source
			// endpoint that was just created.
			var existingTargetEndpoint = ((self.sourceId == self.targetId) && params.targetEndpoint == null) ? eS : params.targetEndpoint,
				eT = prepareEndpoint(existingTargetEndpoint, 1, params, self.target, self.targetId, params.paintStyle, params.hoverPaintStyle);
			if (eT) _addToList(endpointsByElement, this.targetId, eT);
			// if scope not set, set it to be the scope for the source endpoint.
			if (!this.scope) this.scope = this.endpoints[0].scope;		
			
			// if delete endpoints on detach, keep a record of just exactly which endpoints they are.
			if (params.deleteEndpointsOnDetach)
				self.endpointsToDeleteOnDetach = [eS, eT];
			
			// merge all the parameters objects into the connection.  parameters set
			// on the connection take precedence; then target endpoint params, then
			// finally source endpoint params.
			var _p = jsPlumb.CurrentLibrary.extend({}, this.endpoints[0].getParameters());
			jsPlumb.CurrentLibrary.extend(_p, this.endpoints[1].getParameters());
			jsPlumb.CurrentLibrary.extend(_p, self.getParameters());
			self.setParameters(_p);
			
			var _bindConnectorEvents = function() {
				// add mouse events
				self.connector.bind("click", function(con, e) {
					_mouseWasDown = false; 
					self.fire("click", self, e);
				});
				self.connector.bind("dblclick", function(con, e) { _mouseWasDown = false;self.fire("dblclick", self, e); });
				self.connector.bind("mouseenter", function(con, e) {
					if (!self.isHover()) {
						if (_connectionBeingDragged == null) {
							self.setHover(true, false);
						}
						self.fire("mouseenter", self, e);
					}
				});
				self.connector.bind("mouseexit", function(con, e) {
					if (self.isHover()) {
						if (_connectionBeingDragged == null) {
							self.setHover(false, false);
						}
						self.fire("mouseexit", self, e);
					}
				});
				self.connector.bind("mousedown", function(con, e) { 
					_mouseDown = true;
					_mouseDownAt = jsPlumb.CurrentLibrary.getPageXY(e);
				});
				self.connector.bind("mouseup", function(con, e) { 
					_mouseDown = false;
					if (self.connector == _connectionBeingDragged) _connectionBeingDragged = null;
				});
			
			};

			/*
			 * Function: setConnector
			 * Sets the Connection's connector (eg "Bezier", "Flowchart", etc).  You pass a Connector definition into this method - the same
			 * thing that you would set as the 'connector' property on a jsPlumb.connect call.
			 * 
			 * Parameters:
			 * 	connector		-	Connector definition
			 */
			this.setConnector = function(connector, doNotRepaint) {
				if (self.connector != null) _removeElements(self.connector.getDisplayElements(), self.parent);
				var connectorArgs = { 
					_jsPlumb:self._jsPlumb, 
					parent:params.parent, 
					cssClass:params.cssClass, 
					container:params.container,
					tooltip:self.tooltip
				};
				if (connector.constructor == String) 
					this.connector = new jsPlumb.Connectors[renderMode][connector](connectorArgs); // lets you use a string as shorthand.
				else if (connector.constructor == Array)
					this.connector = new jsPlumb.Connectors[renderMode][connector[0]](jsPlumb.extend(connector[1], connectorArgs));
				self.canvas = self.connector.canvas;
				_bindConnectorEvents();				
				if (!doNotRepaint) self.repaint();
			};
			/*
			 * Property: connector
			 * The underlying Connector for this Connection (eg. a Bezier connector, straight line connector, flowchart connector etc)
			 */			
						
			self.setConnector(this.endpoints[0].connector || 
							  this.endpoints[1].connector || 
							  params.connector || 
							  _currentInstance.Defaults.Connector || 
							  jsPlumb.Defaults.Connector, true);
							  
							  
			// override setHover to pass it down to the underlying connector
			var _sh = self.setHover;
			self.setHover = function() {
				self.connector.setHover.apply(self.connector, arguments);
				_sh.apply(self, arguments);
			};
			
			this.setPaintStyle(this.endpoints[0].connectorStyle || 
							   this.endpoints[1].connectorStyle || 
							   params.paintStyle || 
							   _currentInstance.Defaults.PaintStyle || 
							   jsPlumb.Defaults.PaintStyle, true);
						
			this.setHoverPaintStyle(this.endpoints[0].connectorHoverStyle || 
									this.endpoints[1].connectorHoverStyle || 
									params.hoverPaintStyle || 
									_currentInstance.Defaults.HoverPaintStyle || 
									jsPlumb.Defaults.HoverPaintStyle, true);
			
			this.paintStyleInUse = this.paintStyle;
			
			/*
			 * Property: overlays
			 * List of Overlays for this Connection.
			 */
			this.overlays = [];
			var processOverlay = function(o) {
				var o = _overlays[i], _newOverlay = null;
				if (o.constructor == Array) {	// this is for the shorthand ["Arrow", { width:50 }] syntax
					// there's also a three arg version:
					// ["Arrow", { width:50 }, {location:0.7}] 
					// which merges the 3rd arg into the 2nd.
					var type = o[0],
						// make a copy of the object so as not to mess up anyone else's reference...
						p = jsPlumb.CurrentLibrary.extend({connection:self, _jsPlumb:_currentInstance}, o[1]);
					if (o.length == 3) jsPlumb.CurrentLibrary.extend(p, o[2]);
					_newOverlay = new jsPlumb.Overlays[renderMode][type](p);
					if (p.events) {
						for (var evt in p.events) {
							_newOverlay.bind(evt, p.events[evt]);
						}
					}
				} else if (o.constructor == String) {
					_newOverlay = new jsPlumb.Overlays[renderMode][o]({connection:self, _jsPlumb:_currentInstance});
				} else {
					_newOverlay = o;
				}										
					
				self.overlays.push(_newOverlay);
			};
			var _overlays = params.overlays || _currentInstance.Defaults.Overlays;
			if (_overlays) {
				for (var i = 0; i < _overlays.length; i++) {
					processOverlay(_overlays[i]);
				}
			}
			
			this.moveParent = function(newParent) {
				var jpcl = jsPlumb.CurrentLibrary, curParent = jpcl.getParent(self.connector.canvas);				
				jpcl.removeElement(self.connector.canvas, curParent);
				jpcl.appendElement(self.connector.canvas, newParent);
				jpcl.removeElement(self.connector.bgCanvas, curParent);
				jpcl.appendElement(self.connector.bgCanvas, newParent);
				for (var i = 0; i < self.overlays.length; i++) {
					jpcl.removeElement(self.overlays[i].canvas, curParent);
					jpcl.appendElement(self.overlays[i].canvas, newParent);		
					if (self.overlays[i].reattachListeners) self.overlays[i].reattachListeners();
				}
				if (self.connector.reattachListeners)		// this is for SVG/VML; change an element's parent and you have to reinit its listeners.
					self.connector.reattachListeners();     // the Canvas implementation doesn't have to care about this
			};
			
// ***************************** PLACEHOLDERS FOR NATURAL DOCS *************************************************
			/*
			 * Function: bind
			 * Bind to an event on the Connection.  
			 * 
			 * Parameters:
			 * 	event - the event to bind.  Available events on a Connection are:
			 *         - *click*						:	notification that a Connection was clicked.  
			 *         - *dblclick*						:	notification that a Connection was double clicked.
			 *         - *mouseenter*					:	notification that the mouse is over a Connection. 
			 *         - *mouseexit*					:	notification that the mouse exited a Connection.
			 *         
			 *  callback - function to callback. This function will be passed the Connection that caused the event, and also the original event.    
			 */
			
			/*
		     * Function: setPaintStyle
		     * Sets the Connection's paint style and then repaints the Connection.
		     * 
		     * Parameters:
		     * 	style - Style to use.
		     */
			
			/*
		     * Function: setHoverPaintStyle
		     * Sets the paint style to use when the mouse is hovering over the Connection. This is null by default.
		     * The hover paint style is applied as extensions to the paintStyle; it does not entirely replace
		     * it.  This is because people will most likely want to change just one thing when hovering, say the
		     * color for example, but leave the rest of the appearance the same.
		     * 
		     * Parameters:
		     * 	style - Style to use when the mouse is hovering.
		     *  doNotRepaint - if true, the Connection will not be repainted.  useful when setting things up initially.
		     */
			
			/*
		     * Function: setHover
		     * Sets/unsets the hover state of this Connection.
		     * 
		     * Parameters:
		     * 	hover - hover state boolean
		     * 	ignoreAttachedElements - if true, does not notify any attached elements of the change in hover state.  used mostly to avoid infinite loops.
		     */
			
// ***************************** END OF PLACEHOLDERS FOR NATURAL DOCS *************************************************			
			
			// overlay finder helper method
			var _getOverlayIndex = function(id) {
				var idx = -1;
				for (var i = 0; i < self.overlays.length; i++) {
					if (id === self.overlays[i].id) {
						idx = i;
						break;
					}
				}
				return idx;
			};
			
			/*
			 * Function: addOverlay
			 * Adds an Overlay to the Connection.
			 * 
			 * Parameters:
			 * 	overlay - Overlay to add.
			 */
			this.addOverlay = function(overlay) { self.overlays.push(overlay); };
			
			/*
			 * Function: getOverlay
			 * Gets an overlay, by ID. Note: by ID.  You would pass an 'id' parameter
			 * in to the Overlay's constructor arguments, and then use that to retrieve
			 * it via this method.
			 */
			this.getOverlay = function(id) {
				var idx = _getOverlayIndex(id);
				return idx >= 0 ? self.overlays[idx] : null;
			};
			
			/*
			 * Function: hideOverlay
			 * Hides the overlay specified by the given id.
			 */
			this.hideOverlay = function(id) {
				var o = self.getOverlay(id);
				if (o) o.hide();
			};
			
			/*
			 * Function: showOverlay
			 * Shows the overlay specified by the given id.
			 */
			this.showOverlay = function(id) {
				var o = self.getOverlay(id);
				if (o) o.show();
			};
			
			/**
			 * Function: removeAllOverlays
			 * Removes all overlays from the Connection, and then repaints.
			 */
			this.removeAllOverlays = function() {
				self.overlays.splice(0, self.overlays.length);
				self.repaint();
			};
			
			/**
			 * Function:removeOverlay
			 * Removes an overlay by ID.  Note: by ID.  this is a string you set in the overlay spec.
			 * Parameters:
			 * overlayId - id of the overlay to remove.
			 */
			this.removeOverlay = function(overlayId) {
				var idx = _getOverlayIndex(overlayId);
				if (idx != -1) {
					var o = self.overlays[idx];
					o.cleanup();
					self.overlays.splice(idx, 1);
				}
			};
			
			/**
			 * Function:removeOverlays
			 * Removes a set of overlays by ID.  Note: by ID.  this is a string you set in the overlay spec.
			 * Parameters:
			 * overlayIds - this function takes an arbitrary number of arguments, each of which is a single overlay id.
			 */
			this.removeOverlays = function() {
				for (var i = 0; i < arguments.length; i++)
					self.removeOverlay(arguments[i]);
			};

			// this is a shortcut helper method to let people add a label as
			// overlay.
			this.labelStyle = params.labelStyle || _currentInstance.Defaults.LabelStyle || jsPlumb.Defaults.LabelStyle;
			this.label = params.label;
			if (this.label) {
				this.overlays.push(new jsPlumb.Overlays[renderMode].Label( {
					cssClass:params.cssClass,
					labelStyle : this.labelStyle,
					label : this.label,
					connection:self,
					_jsPlumb:_currentInstance
				}));
			}

			_updateOffset( { elId : this.sourceId });
			_updateOffset( { elId : this.targetId });

			/*
			 * Function: setLabel
			 * Sets the Connection's label.  
			 * 
			 * Parameters:
			 * 	l	- label to set. May be a String or a Function that returns a String.
			 */
			this.setLabel = function(l) {
				self.label = l;
				_currentInstance.repaint(self.source);
			};

			// paint the endpoints
			var myOffset = offsets[this.sourceId], myWH = sizes[this.sourceId],
			otherOffset = offsets[this.targetId],
			otherWH = sizes[this.targetId],
			initialTimestamp = _timestamp(),
			anchorLoc = this.endpoints[0].anchor.compute( {
				xy : [ myOffset.left, myOffset.top ], wh : myWH, element : this.endpoints[0],
				txy : [ otherOffset.left, otherOffset.top ], twh : otherWH, tElement : this.endpoints[1],
				timestamp:initialTimestamp
			});
			this.endpoints[0].paint( { anchorLoc : anchorLoc, timestamp:initialTimestamp });

			anchorLoc = this.endpoints[1].anchor.compute( {
				xy : [ otherOffset.left, otherOffset.top ], wh : otherWH, element : this.endpoints[1],
				txy : [ myOffset.left, myOffset.top ], twh : myWH, tElement : this.endpoints[0],
				timestamp:initialTimestamp				
			});
			this.endpoints[1].paint({ anchorLoc : anchorLoc, timestamp:initialTimestamp });										    		  		    	    		  
		    
			/*
			 * Paints the Connection.  Not exposed for public usage. 
			 * 
			 * Parameters:
			 * 	elId - Id of the element that is in motion.
			 * 	ui - current library's event system ui object (present if we came from a drag to get here).
			 *  recalc - whether or not to recalculate all anchors etc before painting. 
			 *  timestamp - timestamp of this paint.  If the Connection was last painted with the same timestamp, it does not paint again.
			 */
			this.paint = function(params) {
				/*_group("CONNECTION PAINT");
				_log("ID:", self.id);
				_time("TOTAL");*/
				params = params || {};
				var elId = params.elId, ui = params.ui, recalc = params.recalc, timestamp = params.timestamp,
				// if the moving object is not the source we must transpose the two references.
				swap = false,
				tId = swap ? this.sourceId : this.targetId, sId = swap ? this.targetId : this.sourceId,
				tIdx = swap ? 0 : 1, sIdx = swap ? 1 : 0;

				_updateOffset( { elId : elId, offset : ui, recalc : recalc, timestamp : timestamp });
				_updateOffset( { elId : tId, timestamp : timestamp }); // update the target if this is a forced repaint. otherwise, only the source has been moved.
				
				var sAnchorP = this.endpoints[sIdx].anchor.getCurrentLocation(this.endpoints[sIdx]),				
				tAnchorP = this.endpoints[tIdx].anchor.getCurrentLocation(this.endpoints[tIdx]);
				
				/* paint overlays*/
				var maxSize = 0;
				for ( var i = 0; i < self.overlays.length; i++) {
					var o = self.overlays[i];
					if (o.isVisible()) maxSize = Math.max(maxSize, o.computeMaxSize(self.connector));
				}

				var dim = this.connector.compute(sAnchorP, tAnchorP, 
				this.endpoints[sIdx], this.endpoints[tIdx],
				this.endpoints[sIdx].anchor, this.endpoints[tIdx].anchor, 
				self.paintStyleInUse.lineWidth, maxSize);
				
				self.connector.paint(dim, self.paintStyleInUse);

				/* paint overlays*/
				for ( var i = 0; i < self.overlays.length; i++) {
					var o = self.overlays[i];
					if (o.isVisible) self.overlayPlacements[i] = o.draw(self.connector, self.paintStyleInUse, dim);
				}
				
				//_timeEnd("TOTAL");
				//_groupEnd("CONNECTION PAINT");
			};			

			/*
			 * Function: repaint
			 * Repaints the Connection.
			 */
			this.repaint = function(params) {
				params = params || {};
				this.paint({ elId : this.sourceId, recalc : true, timestamp:params.timestamp });
			};
			// resizing (using the jquery.ba-resize plugin). todo: decide
			// whether to include or not.
			if (this.source.resize) {
				this.source.resize(function(e) {
					jsPlumb.repaint(self.sourceId);
				});
			}
			
			// just to make sure the UI gets initialised fully on all browsers.
			self.repaint();
		};
		
// ENDPOINT HELPER FUNCTIONS
		var _makeConnectionDragHandler = function(placeholder) {
			return function() {
				var _ui = jsPlumb.CurrentLibrary.getUIPosition(arguments),
				el = placeholder.element;
				jsPlumb.CurrentLibrary.setOffset(el, _ui);
				_draw(_getElementObject(el), _ui);
			};
		};		
		
		var _makeFloatingEndpoint = function(paintStyle, referenceAnchor, endpoint, referenceCanvas, sourceElement) {			
			var floatingAnchor = new FloatingAnchor( { reference : referenceAnchor, referenceCanvas : referenceCanvas });
			return _newEndpoint({ paintStyle : paintStyle, endpoint : endpoint, anchor : floatingAnchor, source : sourceElement });
		};
		
		/**
		 * creates a placeholder div for dragging purposes, adds it to the DOM, and pre-computes its offset. then returns
		 * both the element id and a selector for the element.
		 */
		var _makeDraggablePlaceholder = function(placeholder, parent) {
			var n = document.createElement("div");
			n.style.position = "absolute";
			var placeholderDragElement = _getElementObject(n);
			_appendElement(n, parent);
			var id = _getId(placeholderDragElement);
			_updateOffset( { elId : id });
			// create and assign an id, and initialize the offset.
			placeholder.id = id;
			placeholder.element = placeholderDragElement;
		};

		/*
		 * Class: Endpoint 
		 * 
		 * Models an endpoint. Can have 1 to 'maxConnections' Connections emanating from it (set maxConnections to -1 
		 * to allow unlimited).  Typically, if you use 'jsPlumb.connect' to programmatically connect two elements, you won't
		 * actually deal with the underlying Endpoint objects.  But if you wish to support drag and drop Connections, one of the ways you
		 * do so is by creating and registering Endpoints using 'jsPlumb.addEndpoint', and marking these Endpoints as 'source' and/or
		 * 'target' Endpoints for Connections.  
		 * 
		 * 
		 */

		/*
		 * Function: Endpoint 
		 * 
		 * Endpoint constructor.
		 * 
		 * Parameters: 
		 * anchor - definition of the Anchor for the endpoint.  You can include one or more Anchor definitions here; if you include more than one, jsPlumb creates a 'dynamic' Anchor, ie. an Anchor which changes position relative to the other elements in a Connection.  Each Anchor definition can be either a string nominating one of the basic Anchors provided by jsPlumb (eg. "TopCenter"), or a four element array that designates the Anchor's location and orientation (eg, and this is equivalent to TopCenter, [ 0.5, 0, 0, -1 ]).  To provide more than one Anchor definition just put them all in an array. You can mix string definitions with array definitions.
		 * endpoint - optional Endpoint definition. This takes the form of either a string nominating one of the basic Endpoints provided by jsPlumb (eg. "Rectangle"), or an array containing [name,params] for those cases where you don't wish to use the default values, eg. [ "Rectangle", { width:5, height:10 } ].
		 * paintStyle - endpoint style, a js object. may be null. 
		 * hoverPaintStyle - style to use when the mouse is hovering over the Endpoint. A js object. may be null; defaults to null. 
		 * source - element the Endpoint is attached to, of type String (an element id) or element selector. Required.
		 * canvas - canvas element to use. may be, and most often is, null.
		 * container - optional id or selector instructing jsPlumb where to attach the element it creates for this endpoint.  you should read the documentation for a full discussion of this.
		 * connections - optional list of Connections to configure the Endpoint with. 
		 * isSource - boolean. indicates the endpoint can act as a source of new connections. Optional; defaults to false.
		 * maxConnections - integer; defaults to 1.  a value of -1 means no upper limit. 
		 * dragOptions - if isSource is set to true, you can supply arguments for the underlying library's drag method. Optional; defaults to null. 
		 * connectorStyle - if isSource is set to true, this is the paint style for Connections from this Endpoint. Optional; defaults to null.
		 * connectorHoverStyle - if isSource is set to true, this is the hover paint style for Connections from this Endpoint. Optional; defaults to null.
		 * connector - optional Connector type to use.  Like 'endpoint', this may be either a single string nominating a known Connector type (eg. "Bezier", "Straight"), or an array containing [name, params], eg. [ "Bezier", { curviness:160 } ].
		 * connectorOverlays - optional array of Overlay definitions that will be applied to any Connection from this Endpoint. 
		 * isTarget - boolean. indicates the endpoint can act as a target of new connections. Optional; defaults to false.
		 * dropOptions - if isTarget is set to true, you can supply arguments for the underlying library's drop method with this parameter. Optional; defaults to null. 
		 * reattach - optional boolean that determines whether or not the Connections reattach after they have been dragged off an Endpoint and left floating. defaults to false: Connections dropped in this way will just be deleted.
		 */
		var Endpoint = function(params) {
			var self = this;
			self.idPrefix = "_jsplumb_e_";
			jsPlumb.jsPlumbUIComponent.apply(this, arguments);
			params = params || {};

// ***************************** PLACEHOLDERS FOR NATURAL DOCS *************************************************
			/*
			 * Function: bind
			 * Bind to an event on the Endpoint.  
			 * 
			 * Parameters:
			 * 	event - the event to bind.  Available events on an Endpoint are:
			 *         - *click*						:	notification that a Endpoint was clicked.  
			 *         - *dblclick*						:	notification that a Endpoint was double clicked.
			 *         - *mouseenter*					:	notification that the mouse is over a Endpoint. 
			 *         - *mouseexit*					:	notification that the mouse exited a Endpoint.
			 *         
			 *  callback - function to callback. This function will be passed the Endpoint that caused the event, and also the original event.    
			 */
			
			/*
		     * Function: setPaintStyle
		     * Sets the Endpoint's paint style and then repaints the Endpoint.
		     * 
		     * Parameters:
		     * 	style - Style to use.
		     */
			
			/*
		     * Function: setHoverPaintStyle
		     * Sets the paint style to use when the mouse is hovering over the Endpoint. This is null by default.
		     * The hover paint style is applied as extensions to the paintStyle; it does not entirely replace
		     * it.  This is because people will most likely want to change just one thing when hovering, say the
		     * color for example, but leave the rest of the appearance the same.
		     * 
		     * Parameters:
		     * 	style - Style to use when the mouse is hovering.
		     *  doNotRepaint - if true, the Endpoint will not be repainted.  useful when setting things up initially.
		     */
			
			/*
		     * Function: setHover
		     * Sets/unsets the hover state of this Endpoint.
		     * 
		     * Parameters:
		     * 	hover - hover state boolean
		     * 	ignoreAttachedElements - if true, does not notify any attached elements of the change in hover state.  used mostly to avoid infinite loops.
		     */
			
// ***************************** END OF PLACEHOLDERS FOR NATURAL DOCS *************************************************
			
			var visible = true;
			/*
				Function: isVisible
				Returns whether or not the Endpoint is currently visible.
			*/
			this.isVisible = function() { return visible; };
			/*
				Function: setVisible
				Sets whether or not the Endpoint is currently visible.

				Parameters:
					visible - whether or not the Endpoint should be visible.
					doNotChangeConnections - Instructs jsPlumb to not pass the visible state on to any attached Connections. defaults to false.
					doNotNotifyOtherEndpoint - Instructs jsPlumb to not pass the visible state on to Endpoints at the other end of any attached Connections. defaults to false. 
			*/
			this.setVisible = function(v, doNotChangeConnections, doNotNotifyOtherEndpoint) {
				visible = v;
				if (self.canvas) self.canvas.style.display = v ? "block" : "none";
				if (!doNotChangeConnections) {
					for (var i = 0; i < self.connections.length; i++) {
						self.connections[i].setVisible(v);
						if (!doNotNotifyOtherEndpoint) {
							var oIdx = self === self.connections[i].endpoints[0] ? 1 : 0;
							// only change the other endpoint if this is its only connection.
							if (self.connections[i].endpoints[oIdx].connections.length == 1) self.connections[i].endpoints[oIdx].setVisible(v, true, true);
						}
					}
				}
			};			
			var _element = params.source,  _uuid = params.uuid, floatingEndpoint = null,  inPlaceCopy = null;
			if (_uuid) endpointsByUUID[_uuid] = self;
			var _elementId = _getAttribute(_element, "id");
			this.elementId = _elementId;
			this.element = _element;
			
			if (params.dynamicAnchors)
				self.anchor = new DynamicAnchor(jsPlumb.makeAnchors(params.dynamicAnchors));
			else 			
				self.anchor = params.anchor ? jsPlumb.makeAnchor(params.anchor, _elementId, _currentInstance) : params.anchors ? jsPlumb.makeAnchor(params.anchors, _elementId, _currentInstance) : jsPlumb.makeAnchor("TopCenter", _elementId, _currentInstance);
				
			// ANCHOR MANAGER
			if (!params.transient) // in place copies, for example, are transient.  they will never need to be retrieved during a paint cycle, because they dont move, and then they are deleted.
				_currentInstance.anchorManager.add(self, _elementId);
			 
			var _endpoint = params.endpoint || _currentInstance.Defaults.Endpoint || jsPlumb.Defaults.Endpoint || "Dot",
			endpointArgs = { _jsPlumb:self._jsPlumb, parent:params.parent, container:params.container, tooltip:params.tooltip, connectorTooltip:params.connectorTooltip };
			if (_endpoint.constructor == String) 
				_endpoint = new jsPlumb.Endpoints[renderMode][_endpoint](endpointArgs);
			else if (_endpoint.constructor == Array) {
				endpointArgs = jsPlumb.extend(_endpoint[1], endpointArgs);
				_endpoint = new jsPlumb.Endpoints[renderMode][_endpoint[0]](endpointArgs);
			}
			else 
				_endpoint = _endpoint.clone();
			
			// assign a clone function using our derived endpointArgs. this is used when a drag starts: the endpoint that was dragged is cloned,
			// and the clone is left in its place while the original one goes off on a magical journey. 
			this.clone = function() {
				var o = new Object();
				_endpoint.constructor.apply(o, [endpointArgs]);
				return o;
			};
			
			self.endpoint = _endpoint;
			self.type = self.endpoint.type;
			// override setHover to pass it down to the underlying endpoint
			var _sh = self.setHover;
			self.setHover = function() {
				self.endpoint.setHover.apply(self.endpoint, arguments);
				_sh.apply(self, arguments);
			};
			
			// TODO this event listener registration code is identical to what Connection does: it should be refactored.
			this.endpoint.bind("click", function(e) { self.fire("click", self, e); });
			this.endpoint.bind("dblclick", function(e) { self.fire("dblclick", self, e); });
			this.endpoint.bind("mouseenter", function(con, e) {
				if (!self.isHover()) {
					self.setHover(true, false);
					self.fire("mouseenter", self, e);
				}
			});
			this.endpoint.bind("mouseexit", function(con, e) {
				if (self.isHover()) {
					self.setHover(false, false);
					self.fire("mouseexit", self, e);
				}
			});
			// TODO this event listener registration code above is identical to what Connection does: it should be refactored.
			
			this.setPaintStyle(params.paintStyle || 
							   params.style || 
							   _currentInstance.Defaults.EndpointStyle || 
							   jsPlumb.Defaults.EndpointStyle, true);
			this.setHoverPaintStyle(params.hoverPaintStyle || 
									_currentInstance.Defaults.EndpointHoverStyle || 
									jsPlumb.Defaults.EndpointHoverStyle, true);
			this.paintStyleInUse = this.paintStyle;
			this.connectorStyle = params.connectorStyle;
			this.connectorHoverStyle = params.connectorHoverStyle;
			this.connectorOverlays = params.connectorOverlays;
			this.connector = params.connector;
			this.connectorTooltip = params.connectorTooltip;
			this.parent = params.parent;
			this.isSource = params.isSource || false;
			this.isTarget = params.isTarget || false;
			
			var _maxConnections = params.maxConnections || _currentInstance.Defaults.MaxConnections; // maximum number of connections this endpoint can be the source of.
						
			this.getAttachedElements = function() {
				return self.connections;
			};
			
			/*
			 * Property: canvas
			 * The Endpoint's Canvas.
			 */
			this.canvas = this.endpoint.canvas;
			/*
			 * Property: connections
			 * List of Connections this Endpoint is attached to.
			 */
			this.connections = params.connections || [];
			/*
			 * Property: scope
			 * Scope descriptor for this Endpoint.
			 */
			this.scope = params.scope || DEFAULT_SCOPE;
			this.timestamp = null;
			var _reattach = params.reattach || false;
			var dragAllowedWhenFull = params.dragAllowedWhenFull || true;

			this.computeAnchor = function(params) {
				return self.anchor.compute(params);
			};
			/*
			 * Function: addConnection
			 *   Adds a Connection to this Endpoint.
			 *   
			 * Parameters:
			 *   connection - the Connection to add.
			 */
			this.addConnection = function(connection) {
				self.connections.push(connection);
			};			
			/*
			 * Function: detach
			 *   Detaches the given Connection from this Endpoint.
			 *   
			 * Parameters:
			 *   connection - the Connection to detach.
			 *   ignoreTarget - optional; tells the Endpoint to not notify the Connection target that the Connection was detached.  The default behaviour is to notify the target.
			 */
			this.detach = function(connection, ignoreTarget, forceDetach, doNotFireEvent) {
				var idx = _findIndex(self.connections, connection), actuallyDetached = false;
				if (idx >= 0) {		
					// 1. does the connection have a before detach (note this also checks jsPlumb's bound
					// detach handlers; but then Endpoint's check will, too, hmm.)
					if (forceDetach || connection.isDetachAllowed(connection)) {
						// get the target endpoint
						var t = connection.endpoints[0] == self ? connection.endpoints[1] : connection.endpoints[0];
						// check with both endpoints that it is ok to detach
						if (forceDetach || (self.isDetachAllowed(connection) && t.isDetachAllowed(connection))) {
					
							self.connections.splice(idx, 1);										
					
							// this avoids a circular loop
							if (!ignoreTarget) {
							
								t.detach(connection, true, forceDetach);
								// check connection to see if we want to delete the other endpoint.
								// if the user uses makeTarget to make some element a target for connections,
								// it is possible that they will have set 'endpointsToDeleteOnDetach': when
								// you make a connection to an element that acts as a target (note: NOT an
								// Endpoint; just some div as a target), Endpoints are created for that
								// connection. so if you then delete that Connection, it is feasible you 
								// will want these auto-generated endpoints to be removed.
								if (connection.endpointsToDeleteOnDetach){
									for (var i = 0; i < connection.endpointsToDeleteOnDetach.length; i++) {
										if (connection.endpointsToDeleteOnDetach[i].connections.length == 0) 
											jsPlumb.deleteEndpoint(connection.endpointsToDeleteOnDetach[i]);							
									}
								}
							}
							_removeElements(connection.connector.getDisplayElements(), connection.parent);
							_removeFromList(connectionsByScope, connection.scope, connection);
							actuallyDetached = true;
							if(!ignoreTarget && !doNotFireEvent) fireDetachEvent(connection);
						}
					}
				}
				return actuallyDetached;
			};			

			/*
			 * Function: detachAll
			 *   Detaches all Connections this Endpoint has.
			 */
			this.detachAll = function() {
				while (self.connections.length > 0) {
					self.detach(self.connections[0], false, true);
				}
			};
			/*
			 * Function: detachFrom
			 *   Removes any connections from this Endpoint that are connected to the given target endpoint.
			 *   
			 * Parameters:
			 *   targetEndpoint - Endpoint from which to detach all Connections from this Endpoint.
			 */
			this.detachFrom = function(targetEndpoint) {
				var c = [];
				for ( var i = 0; i < self.connections.length; i++) {
					if (self.connections[i].endpoints[1] == targetEndpoint
							|| self.connections[i].endpoints[0] == targetEndpoint) {
						c.push(self.connections[i]);
					}
				}
				for ( var i = 0; i < c.length; i++) {
					if (self.detach(c[i])) 
						c[i].setHover(false, false);					
				}
			};			
			/*
			 * Function: detachFromConnection
			 *   Detach this Endpoint from the Connection, but leave the Connection alive. Used when dragging.
			 *   
			 * Parameters:
			 *   connection - Connection to detach from.
			 */
			this.detachFromConnection = function(connection) {
				var idx = _findIndex(self.connections, connection);
				if (idx >= 0) {
					self.connections.splice(idx, 1);
				}
			};

			/*
			 * Function: getElement
			 *   Returns the DOM element this Endpoint is attached to.
			 */
			this.getElement = function() {
				return _element;
			};		
			
			/*
			 * Function: setElement
			 * Sets the DOM element this Endpoint is attached to.  
			 */
			this.setElement = function(el) {
				// TODO possibly have this object take charge of moving the UI components into the appropriate
				// parent.  this is used only by makeSource right now, and that function takes care of
				// moving the UI bits and pieces.  however it would s			
				var parentId = _getId(el);
				// remove the endpoint from the list for the current endpoint's element
				_removeFromList(endpointsByElement, _elementId, self);	
				_element = _getElementObject(el);
				_elementId = _getId(_element);
				self.elementId = _elementId;
				
				// need to get the new parent now
				var newParentElement = _getParentFromParams({source:parentId}),
				curParent = jpcl.getParent(self.canvas);
				jpcl.removeElement(self.canvas, curParent);
				jpcl.appendElement(self.canvas, newParentElement);								
				
				// now move connection(s)...i would expect there to be only one but we will iterate.
				for (var i = 0; i < self.connections.length; i++) {
					self.connections[i].moveParent(newParentElement);
					self.connections[i].sourceId = _elementId;
					self.connections[i].source = _element;					
				}	
									
				_addToList(endpointsByElement, parentId, self);
				_currentInstance.repaint(parentId);
			};

			/*
			 * Function: getUuid
			 *   Returns the UUID for this Endpoint, if there is one. Otherwise returns null.
			 */
			this.getUuid = function() {
				return _uuid;
			};
			/**
			 * private but must be exposed.
			 */
			this.makeInPlaceCopy = function() {
				return _newEndpoint( { 
					anchor : self.anchor, 
					source : _element, 
					paintStyle : this.paintStyle, 
					endpoint : _endpoint,
					transient:true
				});
			};
			/*
			 * Function: isConnectedTo
			 *   Returns whether or not this endpoint is connected to the given Endpoint.
			 *   
			 * Parameters:
			 *   endpoint - Endpoint to test.
			 */
			this.isConnectedTo = function(endpoint) {
				var found = false;
				if (endpoint) {
					for ( var i = 0; i < self.connections.length; i++) {
						if (self.connections[i].endpoints[1] == endpoint) {
							found = true;
							break;
						}
					}
				}
				return found;
			};

			/**
			 * private but needs to be exposed.
			 */
			this.isFloating = function() {
				return floatingEndpoint != null;
			};
			
			/**
			 * returns a connection from the pool; used when dragging starts.  just gets the head of the array if it can.
			 */
			this.connectorSelector = function() {
				return (self.connections.length < _maxConnections) || _maxConnections == -1 ? null : self.connections[0];
			};

			/*
			 * Function: isFull
			 *   Returns whether or not the Endpoint can accept any more Connections.
			 */
			this.isFull = function() {
				return !(self.isFloating() || _maxConnections < 1 || self.connections.length < _maxConnections);				
			};
			/*
			 * Function: setDragAllowedWhenFull
			 *   Sets whether or not connections can be dragged from this Endpoint once it is full. You would use this in a UI in 
			 *   which you're going to provide some other way of breaking connections, if you need to break them at all. This property 
			 *   is by default true; use it in conjunction with the 'reattach' option on a connect call.
			 *   
			 * Parameters:
			 *   allowed - whether drag is allowed or not when the Endpoint is full.
			 */
			this.setDragAllowedWhenFull = function(allowed) {
				dragAllowedWhenFull = allowed;
			};
			/*
			 * Function: setStyle
			 *   Sets the paint style of the Endpoint.  This is a JS object of the same form you supply to a jsPlumb.addEndpoint or jsPlumb.connect call.
			 *   TODO move setStyle into EventGenerator, remove it from here. is Connection's method currently setPaintStyle ? wire that one up to
			 *   setStyle and deprecate it if so.
			 *   
			 * Parameters:
			 *   style - Style object to set, for example {fillStyle:"blue"}.
			 *   
			 *  @deprecated use setPaintStyle instead.
			 */
			this.setStyle = self.setPaintStyle;

			/**
			 * a deep equals check. everything must match, including the anchor,
			 * styles, everything. TODO: finish Endpoint.equals
			 */
			this.equals = function(endpoint) {
				return this.anchor.equals(endpoint.anchor);
			};
			
			// a helper function that tries to find a connection to the given element, and returns it if so. if elementWithPrecedence is null,
			// or no connection to it is found, we return the first connection in our list.
			var findConnectionToUseForDynamicAnchor = function(elementWithPrecedence) {
				var idx = 0;
				if (elementWithPrecedence != null) {
					for (var i = 0; i < self.connections.length; i++) {
						if (self.connections[i].sourceId == elementWithPrecedence || self.connections[i].targetId == elementWithPrecedence) {
							idx = i;
							break;
						}
					}
				}
				
				return self.connections[idx];
			};

			/*
			 * Function: paint
			 *   Paints the Endpoint, recalculating offset and anchor positions if necessary. This does NOT paint
			 *   any of the Endpoint's connections.
			 *   
			 * Parameters:
			 *   timestamp - optional timestamp advising the Endpoint of the current paint time; if it has painted already once for this timestamp, it will not paint again.
			 *   canvas - optional Canvas to paint on.  Only used internally by jsPlumb in certain obscure situations.
			 *   connectorPaintStyle - paint style of the Connector attached to this Endpoint. Used to get a fillStyle if nothing else was supplied.
			 */
			this.paint = function(params) {
				params = params || {};
				var timestamp = params.timestamp;
				if (!timestamp || self.timestamp !== timestamp) {			
					_updateOffset({ elId:_elementId, timestamp:timestamp });
					var ap = params.anchorPoint, connectorPaintStyle = params.connectorPaintStyle;
					if (ap == null) {
						var xy = params.offset || offsets[_elementId],
						wh = params.dimensions || sizes[_elementId];
						if (xy == null || wh == null) {
							_updateOffset( { elId : _elementId, timestamp : timestamp });
							xy = offsets[_elementId];
							wh = sizes[_elementId];
						}
						var anchorParams = { xy : [ xy.left, xy.top ], wh : wh, element : self, timestamp : timestamp };
						if (self.anchor.isDynamic && self.connections.length > 0) {
							var c = findConnectionToUseForDynamicAnchor(params.elementWithPrecedence),
							oIdx = c.endpoints[0] == self ? 1 : 0,
							oId = oIdx == 0 ? c.sourceId : c.targetId,
							oOffset = offsets[oId], oWH = sizes[oId];
							anchorParams.txy = [ oOffset.left, oOffset.top ];
							anchorParams.twh = oWH;
							anchorParams.tElement = c.endpoints[oIdx];
						}
						ap = self.anchor.compute(anchorParams);
					}
										
					var d = _endpoint.compute(ap, self.anchor.getOrientation(_endpoint), self.paintStyleInUse, connectorPaintStyle || self.paintStyleInUse);
					_endpoint.paint(d, self.paintStyleInUse, self.anchor);					
					self.timestamp = timestamp;
				}
			};
			
			this.repaint = this.paint;

			/**
			 * @deprecated
			 */
			this.removeConnection = this.detach; // backwards compatibility

			// is this a connection source? we make it draggable and have the
			// drag listener maintain a connection with a floating endpoint.
			if (params.isSource && jsPlumb.CurrentLibrary.isDragSupported(_element)) {
				var placeholderInfo = {
						id:null,
						element:null
				}, jpc = null, existingJpc = false, existingJpcParams = null;
				var start = function() {										
					jpc = self.connectorSelector();
					if (self.isFull() && !dragAllowedWhenFull) return false;
					_updateOffset( { elId : _elementId });
					inPlaceCopy = self.makeInPlaceCopy();
					inPlaceCopy.paint();										
					
					_makeDraggablePlaceholder(placeholderInfo, self.parent);
					
					// set the offset of this div to be where 'inPlaceCopy' is, to start with.
					// TODO merge this code with the code in both Anchor and FloatingAnchor, because it
					// does the same stuff.
					var ipcoel = _getElementObject(inPlaceCopy.canvas),
					ipco = jsPlumb.CurrentLibrary.getOffset(ipcoel),
					po = adjustForParentOffsetAndScroll([ipco.left, ipco.top], inPlaceCopy.canvas);
					jsPlumb.CurrentLibrary.setOffset(placeholderInfo.element, {left:po[0], top:po[1]});															
					
					// store the id of the dragging div and the source element. the drop function will pick these up.					
					_setAttribute(_getElementObject(self.canvas), "dragId", placeholderInfo.id);
					_setAttribute(_getElementObject(self.canvas), "elId", _elementId);
					// create a floating anchor
					floatingEndpoint = _makeFloatingEndpoint(self.paintStyle, self.anchor, _endpoint, self.canvas, placeholderInfo.element);
					
					if (jpc == null) {                                                                                                                                                         
						self.anchor.locked = true;
						// create a connection. one end is this endpoint, the other is a floating endpoint.
						jpc = _newConnection({
							sourceEndpoint : self,
							targetEndpoint : floatingEndpoint,
							source : _getElementObject(_element),
							target : placeholderInfo.element,
							anchors : [ self.anchor, floatingEndpoint.anchor ],
							paintStyle : params.connectorStyle, // this can be null. Connection will use the default.
							hoverPaintStyle:params.connectorHoverStyle,
							connector : params.connector, // this can also be null. Connection will use the default.
							overlays : params.connectorOverlays 
						});
						// TODO determine whether or not we wish to do de-select hover when dragging a connection.
						// it may be the case that we actually want to set it, since it provides a good
						// visual cue.
						jpc.connector.setHover(false, false);
					} else {
						existingJpc = true;
						// TODO determine whether or not we wish to do de-select hover when dragging a connection.
						// it may be the case that we actually want to set it, since it provides a good
						// visual cue.
						jpc.connector.setHover(false, false);
						// if existing connection, allow to be dropped back on the source endpoint (issue 51).
						_initDropTarget(_getElementObject(inPlaceCopy.canvas));						
						var anchorIdx = jpc.sourceId == _elementId ? 0 : 1;  	// are we the source or the target?
						
						jpc.floatingAnchorIndex = anchorIdx;					// save our anchor index as the connection's floating index.						
						self.detachFromConnection(jpc);							// detach from the connection while dragging is occurring.
						
						// store the original scope (issue 57)
						var c = _getElementObject(self.canvas),
						dragScope = jsPlumb.CurrentLibrary.getDragScope(c);
						_setAttribute(c, "originalScope", dragScope);
						// now we want to get this endpoint's DROP scope, and set it for now: we can only be dropped on drop zones
						// that have our drop scope (issue 57).
						var dropScope = jsPlumb.CurrentLibrary.getDropScope(c);//jpc.endpoints[anchorIdx == 0 ? 1 : 0].getDropScope();
						jsPlumb.CurrentLibrary.setDragScope(c, dropScope);
				
						// now we replace ourselves with the temporary div we created above:
						if (anchorIdx == 0) {
							existingJpcParams = [ jpc.source, jpc.sourceId, i, dragScope ];
							jpc.source = placeholderInfo.element;
							jpc.sourceId = placeholderInfo.id;
						} else {
							existingJpcParams = [ jpc.target, jpc.targetId, i, dragScope ];
							jpc.target = placeholderInfo.element;
							jpc.targetId = placeholderInfo.id;
						}

						// lock the other endpoint; if it is dynamic it will not move while the drag is occurring.
						jpc.endpoints[anchorIdx == 0 ? 1 : 0].anchor.locked = true;
						// store the original endpoint and assign the new floating endpoint for the drag.
						jpc.suspendedEndpoint = jpc.endpoints[anchorIdx];
						jpc.endpoints[anchorIdx] = floatingEndpoint;
					}

					// register it and register connection on it.
					floatingConnections[placeholderInfo.id] = jpc;
					floatingEndpoint.addConnection(jpc);

					// only register for the target endpoint; we will not be dragging the source at any time
					// before this connection is either discarded or made into a permanent connection.
					_addToList(endpointsByElement, placeholderInfo.id, floatingEndpoint);
					
					// tell jsplumb about it
					_currentInstance.currentlyDragging = true;
				};

				var jpcl = jsPlumb.CurrentLibrary,
				dragOptions = params.dragOptions || {},
				defaultOpts = jsPlumb.extend( {}, jpcl.defaultDragOptions),
				startEvent = jpcl.dragEvents["start"],
				stopEvent = jpcl.dragEvents["stop"],
				dragEvent = jpcl.dragEvents["drag"];
				
				dragOptions = jsPlumb.extend(defaultOpts, dragOptions);
				dragOptions.scope = dragOptions.scope || self.scope;
				dragOptions[startEvent] = _wrap(dragOptions[startEvent], start);
				// extracted drag handler function so can be used by makeSource
				dragOptions[dragEvent] = _wrap(dragOptions[dragEvent], _makeConnectionDragHandler(placeholderInfo));
				dragOptions[stopEvent] = _wrap(dragOptions[stopEvent],
					function() {						
						_removeFromList(endpointsByElement, placeholderInfo.id, floatingEndpoint);
						_removeElements( [ placeholderInfo.element[0], floatingEndpoint.canvas ], _element); // TODO: clean up the connection canvas (if the user aborted)
						_removeElement(inPlaceCopy.canvas, _element);	
						
						_currentInstance.anchorManager.clearFor(placeholderInfo.id);
						
						var idx = jpc.floatingAnchorIndex == null ? 1 : jpc.floatingAnchorIndex;
						jpc.endpoints[idx == 0 ? 1 : 0].anchor.locked = false;
						if (jpc.endpoints[idx] == floatingEndpoint) {
							// if the connection was an existing one:
							if (existingJpc && jpc.suspendedEndpoint) {
								// fix for issue35, thanks Sylvain Gizard: when firing the detach event make sure the
								// floating endpoint has been replaced.
								if (idx == 0) {
									jpc.source = existingJpcParams[0];
									jpc.sourceId = existingJpcParams[1];
								} else {
									jpc.target = existingJpcParams[0];
									jpc.targetId = existingJpcParams[1];
								}
								
								// restore the original scope (issue 57)
								jsPlumb.CurrentLibrary.setDragScope(existingJpcParams[2], existingJpcParams[3]);
								
								jpc.endpoints[idx] = jpc.suspendedEndpoint;
									
								if (_reattach || !jpc.endpoints[idx == 0 ? 1 : 0].detach(jpc)) {									
									jpc.floatingAnchorIndex = null;
									jpc.suspendedEndpoint.addConnection(jpc);
									jsPlumb.repaint(existingJpcParams[1]);
								} 
							} else {
								// TODO this looks suspiciously kind of like an Endpoint.detach call too.
								// i wonder if this one should post an event though.  maybe this is good like this.
								_removeElements(jpc.connector.getDisplayElements(), self.parent);
								self.detachFromConnection(jpc);								
							}																
						}
						self.anchor.locked = false;												
						self.paint();
						jpc.setHover(false, false);
						jpc.repaint();
						jpc = null;						
						delete inPlaceCopy;							
						delete endpointsByElement[floatingEndpoint.elementId];
						floatingEndpoint = null;
						delete floatingEndpoint;
						
						_currentInstance.currentlyDragging = false;
					});
				
				var i = _getElementObject(self.canvas);				
				jsPlumb.CurrentLibrary.initDraggable(i, dragOptions);
			}

			// pulled this out into a function so we can reuse it for the inPlaceCopy canvas; you can now drop detached connections
			// back onto the endpoint you detached it from.
			var _initDropTarget = function(canvas) {
				if (params.isTarget && jsPlumb.CurrentLibrary.isDropSupported(_element)) {
					var dropOptions = params.dropOptions || _currentInstance.Defaults.DropOptions || jsPlumb.Defaults.DropOptions;
					dropOptions = jsPlumb.extend( {}, dropOptions);
					dropOptions.scope = dropOptions.scope || self.scope;
					var originalAnchor = null,
					dropEvent = jsPlumb.CurrentLibrary.dragEvents['drop'],
					overEvent = jsPlumb.CurrentLibrary.dragEvents['over'],
					outEvent = jsPlumb.CurrentLibrary.dragEvents['out'],				
					drop = function() {
						var draggable = _getElementObject(jsPlumb.CurrentLibrary.getDragObject(arguments)),
						id = _getAttribute(draggable, "dragId"),
						elId = _getAttribute(draggable, "elId"),						
						scope = _getAttribute(draggable, "originalScope"),
						jpc = floatingConnections[id],
						idx = jpc.floatingAnchorIndex == null ? 1 : jpc.floatingAnchorIndex, oidx = idx == 0 ? 1 : 0;
						
						// restore the original scope if necessary (issue 57)						
						if (scope) jsPlumb.CurrentLibrary.setDragScope(draggable, scope);							
						
						if (!self.isFull() && !(idx == 0 && !self.isSource) && !(idx == 1 && !self.isTarget)) {
						
							var _doContinue = true;
							if (jpc.suspendedEndpoint) {
								if (!jpc.isDetachAllowed(jpc) || !jpc.endpoints[idx].isDetachAllowed(jpc) || !jpc.suspendedEndpoint.isDetachAllowed(jpc) || !_currentInstance.checkCondition("beforeDetach", jpc))
									_doContinue = false;								
							}
			
							// these have to be set before testing for beforeDrop.
							if (idx == 0) {
								jpc.source = _element;
								jpc.sourceId = _elementId;
							} else {
								jpc.target = _element;
								jpc.targetId = _elementId;
							}
							
							// now check beforeDrop.  this will be available only on Endpoints that are setup to
							// have a beforeDrop condition (although, secretly, under the hood all Endpoints and 
							// the Connection have them, because they are on jsPlumbUIComponent.  shhh!), because
							// it only makes sense to have it on a target endpoint.
							_doContinue = _doContinue && self.isDropAllowed(jpc);
													
							if (_doContinue) {
								// remove this jpc from the current endpoint
								jpc.endpoints[idx].detachFromConnection(jpc);
								if (jpc.suspendedEndpoint) jpc.suspendedEndpoint.detachFromConnection(jpc);
								jpc.endpoints[idx] = self;
								self.addConnection(jpc);
								if (!jpc.suspendedEndpoint) {  
									_addToList(connectionsByScope, jpc.scope, jpc);
									_initDraggableIfNecessary(_element, params.draggable, {});
								}
								else {
									var suspendedElement = jpc.suspendedEndpoint.getElement(), suspendedElementId = jpc.suspendedEndpoint.elementId;
									// fire a detach event
									_currentInstance.fire("jsPlumbConnectionDetached", {
										source : idx == 0 ? suspendedElement : jpc.source, 
										target : idx == 1 ? suspendedElement : jpc.target,
										sourceId : idx == 0 ? suspendedElementId : jpc.sourceId, 
										targetId : idx == 1 ? suspendedElementId : jpc.targetId,
										sourceEndpoint : idx == 0 ? jpc.suspendedEndpoint : jpc.endpoints[0], 
										targetEndpoint : idx == 1 ? jpc.suspendedEndpoint : jpc.endpoints[1],
										connection : jpc
									});
								}
							
								jsPlumb.repaint(elId);
							
								_currentInstance.fire("jsPlumbConnection", {
									source : jpc.source, target : jpc.target,
									sourceId : jpc.sourceId, targetId : jpc.targetId,
									sourceEndpoint : jpc.endpoints[0], 
									targetEndpoint : jpc.endpoints[1],
									connection:jpc
								});														
							}
						}
			
						_currentInstance.currentlyDragging = false;
						delete floatingConnections[id];						
					};
					
					dropOptions[dropEvent] = _wrap(dropOptions[dropEvent], drop);					
							
					dropOptions[overEvent] = _wrap(dropOptions[overEvent], function() {
						var draggable = jsPlumb.CurrentLibrary.getDragObject(arguments),
							id = _getAttribute( _getElementObject(draggable), "dragId"),
							jpc = floatingConnections[id];
							if (jpc != null) {
								var idx = jpc.floatingAnchorIndex == null ? 1 : jpc.floatingAnchorIndex;
								jpc.endpoints[idx].anchor.over(self.anchor);
							}
					});	
					dropOptions[outEvent] = _wrap(dropOptions[outEvent], function() {
						var draggable = jsPlumb.CurrentLibrary.getDragObject(arguments),
							id = _getAttribute( _getElementObject(draggable), "dragId"),
							jpc = floatingConnections[id];
							if (jpc != null) {
								var idx = jpc.floatingAnchorIndex == null ? 1 : jpc.floatingAnchorIndex;
								jpc.endpoints[idx].anchor.out();
							}
					});	
									
					jsPlumb.CurrentLibrary.initDroppable(canvas, dropOptions);
				}
			};
			
			// initialise the endpoint's canvas as a drop target.  this will be ignored if the endpoint is not a target or drag is not supported.
			_initDropTarget(_getElementObject(self.canvas));			

			return self;
		};					
	};		

	var jsPlumb = window.jsPlumb = new jsPlumbInstance();
	jsPlumb.getInstance = function(_defaults) {
		var j = new jsPlumbInstance(_defaults);
		j.init();
		return j;
	};
	jsPlumb.util = {
		convertStyle : function(s, ignoreAlpha) {
			// TODO: jsPlumb should support a separate 'opacity' style member.
			if ("transparent" === s) return s;
			
			var o = s,
			pad = function(n) { return n.length == 1 ? "0" + n : n; },
			hex = function(k) { return pad(Number(k).toString(16)); },
			pattern = /(rgb[a]?\()(.*)(\))/;
			if (s.match(pattern)) {
				var parts = s.match(pattern)[2].split(",");
				o = "#" + hex(parts[0]) + hex(parts[1]) + hex(parts[2]);
				if (!ignoreAlpha && parts.length == 4) 
					o = o + hex(parts[3]);
			}
		
			return o;
		}	
	};
	
	var _curryAnchor = function(x, y, ox, oy, type, fnInit) {
		return function(params) {
			params = params || {};
			var a = jsPlumb.makeAnchor([ x, y, ox, oy, 0, 0 ], params.elementId, params.jsPlumbInstance);
			a.type = type;
			if (fnInit) fnInit(a, params);
			return a;
		};
	};
	jsPlumb.Anchors["TopCenter"] 		= _curryAnchor(0.5, 0, 0,-1, "TopCenter");
	jsPlumb.Anchors["BottomCenter"] 	= _curryAnchor(0.5, 1, 0, 1, "BottomCenter");
	jsPlumb.Anchors["LeftMiddle"] 		= _curryAnchor(0, 0.5, -1, 0, "LeftMiddle");
	jsPlumb.Anchors["RightMiddle"] 		= _curryAnchor(1, 0.5, 1, 0, "RightMiddle");
	jsPlumb.Anchors["Center"] 			= _curryAnchor(0.5, 0.5, 0, 0, "Center");
	jsPlumb.Anchors["TopRight"] 		= _curryAnchor(1, 0, 0,-1, "TopRight");
	jsPlumb.Anchors["BottomRight"] 		= _curryAnchor(1, 1, 0, 1, "BottomRight");
	jsPlumb.Anchors["TopLeft"] 			= _curryAnchor(0, 0, 0, -1, "TopLeft");
	jsPlumb.Anchors["BottomLeft"] 		= _curryAnchor(0, 1, 0, 1, "BottomLeft");
		
	jsPlumb.Defaults.DynamicAnchors = function(params) {
		return jsPlumb.makeAnchors(["TopCenter", "RightMiddle", "BottomCenter", "LeftMiddle"], params.elementId, params.jsPlumbInstance);
	};
	jsPlumb.Anchors["AutoDefault"]  = function(params) { 
		var a = jsPlumb.makeDynamicAnchor(jsPlumb.Defaults.DynamicAnchors(params));
		a.type = "AutoDefault";
		return a;
	};
	
	jsPlumb.Anchors["Fixed"] = _curryAnchor(0, 0, 0, 0, "Fixed");
	jsPlumb.Anchors["Grid"] = _curryAnchor(0, 0, 0, 0, "Grid", function(anchor,params) { anchor.grid = params.grid; });	
	
	jsPlumb.Anchors["Continuous"] = function(params) {
		return params.jsPlumbInstance.continuousAnchorManager.get(params);
	};
	
})();