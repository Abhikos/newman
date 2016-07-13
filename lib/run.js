var _ = require('lodash'),
    EventEmitter = require('eventemitter3'),
    runtime = require('postman-runtime'),
    Collection = require('postman-collection').Collection,

    runtimeEvents = ['start', 'beforeIteration', 'beforeItem', 'beforePrerequest', 'prerequest',
        'beforeRequest', 'request', 'beforeTest', 'test', 'item', 'iteration', 'beforeScript', 'script', 'console',
        'exception', 'done'];

/**
 * @param {Object} options
 * @param {Collection|Object} options.collection
 * @param {Array|String} options.reporters
 * @param {Function} callback
 *
 * @returns {EventEmitter}
 */
module.exports = function (options, callback) {
    // validate all options. it is to be notet that `options` parameter is option and is polymorphic
    (!callback && _.isFunction(options)) && (
        (callback = options),
        (options = {})
    );
    (!options) && (options = {}); // we initialise this as object to avoid needless validations
    !_.isFunction(callback) && (callback = _.noop);

    var emitter = new EventEmitter(), // @todo: create a new inherited constructor
        runner = new runtime.Runner(),
        collection = options.collection;

    // ensure that the collection option is present before starting a run
    if (!_.isObject(collection)) {
        callback(new Error('newman: expecting a collection to run'));
        return emitter;
    }

    // create a collection in case it is not one. user can send v2 JSON as a source and that will be converted
    // to a collection
    if (_.isPlainObject(collection) && !Collection.isCollection(collection)) {
        collection = new Collection(collection);
    }

    collection && runner.run(collection, {}, function (err, run) {
        var callbacks = {},
            // ensure that the reporter option type polymorphism is handled
            reporters = _.isString(options.reporters) ? [options.reporters] : options.reporters;

        // emit events for all the callbacks triggered by the runtime
        runtimeEvents.forEach(function (eventName) {
            callbacks[eventName] = emitter.emit.bind(emitter, eventName);
        });

        // override the `done` event to fire the end callback
        callbacks.done = function (err) { // @todo - do some meory cleanup here?
            callback(err);
            emitter.emit('done', err); // we now trigger the actual done event which we had overridden
        };

        // initialise all the reporters
        _.isArray(reporters) && _.each(reporters, function (reporterName) {
            // @todo validate reporter name to exist
            // @todo look up for node module "newman-reporter-" as reporters if one is not found locally
            // @todo sanitise the reporter name for security reasons
            (emitter.reporters || (emitter.reporters = {}))[reporterName] =
                new (require('./reporters/' + reporterName))(emitter, options);
        });

        // we ensure that everything is async to comply with event paradigm and start the run
        setImmediate(function () {
            run.start(callbacks);
        });
    });

    return emitter;
};